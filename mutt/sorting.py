"""Autosort: which of your planets a new file belongs on.

Everything about the file is weighed against everything about each planet:
- its name, its note, and what's inside it (typed text, text files, Word,
  PowerPoint, spreadsheets, PDFs, ePubs, link titles and descriptions);
- what the planet is called, and what that name means (a planet called "Food"
  wants recipes even if no file says "food");
- the files already on the planet: their words, kinds, file types, websites and
  colours. Files moved by hand teach it, since they're on the right planet now;
- the shape of a note (a checklist, a quote, a poem, a recipe, code, a diary).

Nothing leaves the server. pick() returns (drawer id, None) for a planet that
fits, or (None, title) for a new planet to make.
"""
import json
import math
import re
import zipfile
import zlib
from collections import Counter
from functools import lru_cache

# ---------------------------------------------------------------- words

TOKEN_RE = re.compile(r'[^\W_]+', re.UNICODE)
CAMEL_RE = re.compile(r'(?<=[a-z])(?=[A-Z])')
YEAR_RE = re.compile(r'^(19|20)\d\d$')
SHORT_OK = {'ai', 'ux', 'ui', 'tv', '3d', 'dj', 'vr', 'ar', 'ml', 'js', 'uk', 'eu', 'ny', 'la', 'bbq', 'diy'}
STOP_WORDS = set("""
a about above after again against all almost also am among an and another any anyone anything are aren around
as at away back be because been before being below between both but by came can cannot come could did didn do
does doesn doing don done down during each either else enough even ever every few for from further get gets
getting go goes going gone got had has hasn have haven having he her here hers herself him himself his how
however if in into is isn it its itself just keep know last least less let like ll made make makes many may me
might mine more most much must my myself near need never no nor not now of off often oh ok okay on once one
only onto or other others otherwise our ours ourselves out over own per put quite rather re really said same
say see seem seems shall she should since so some something sometimes still such sure take than that the
their theirs them themselves then there these they thing things think this those though through thus till to
too toward under until up upon us use used using ve very via want was wasn way we well went were weren what
whatever when where whether which while who whom whose why will with within without won would yeah yes yet you
your yours yourself yourselves
com www http https net org html htm php amp nbsp quot
img dsc dscn pxl untitled copy final edited export next
""".split())

# Everyday words: they still count towards topics, but say little about which
# of your planets a file shares words with.
COMMON = set('''
day days week weeks month months year years time times today tomorrow yesterday tonight morning night people
person thing lot bit part place point case fact kind sort type number group world life hand eye head side end
line level area good great nice bad best better worse big small little large long short high low old young first
second third last early late right left different same important able true real whole full free hard easy fine
amazing incredible awesome cool lovely love loved liked wanted thought knew feel felt look looked looking find
found give gave tell told ask asked try tried start started finish finished kept leave turn turned show showed
move moved live lived happen happened two three four five six seven eight nine ten twenty hundred thousand
million half lots maybe probably definitely actually basically pretty super totally
'''.split())


def stem(word):
    """A light English stemmer, so 'baking', 'baked' and 'bake' agree."""
    if len(word) <= 3 or not word.isascii():
        return word
    if word.endswith('ies') and len(word) > 4:
        word = word[:-3] + 'i'
    elif word.endswith('sses'):
        word = word[:-2]
    elif word.endswith('s') and not word.endswith(('ss', 'us', 'is')):
        word = word[:-1]
    for end in ('ing', 'ed'):
        if word.endswith(end) and len(word) - len(end) >= 3:
            word = word[:-len(end)]
            if len(word) > 3 and word[-1] == word[-2] and word[-1] not in 'lsz':
                word = word[:-1]
            break
    if len(word) > 3 and word.endswith('y'):
        word = word[:-1] + 'i'
    if len(word) > 3 and word.endswith('e'):
        word = word[:-1]
    return word


BOOK_VERB_RE = re.compile(r'\bbook(?:ed|ing)?(?=\s+(?:a|an|the|in|my|our|your|some|tickets?|flights?|tables?|'
                          r'hotels?|trains?|appointments?|it|them|this|that|him|her|us)\b)', re.I)


def words(text):
    """Plain lowercase words, without filler."""
    text = BOOK_VERB_RE.sub('reserve', CAMEL_RE.sub(' ', text or ''))
    found = []
    for word in TOKEN_RE.findall(text.lower()):
        if word in STOP_WORDS or (word.isdigit() and not YEAR_RE.match(word)):
            continue
        if len(word) < 3 and word not in SHORT_OK and word.isascii():
            continue
        found.append(word)
    return found


@lru_cache(maxsize=50000)
def _stem(word):
    return stem(word)


def stems(text):
    return [_stem(w) for w in words(text)]


# ---------------------------------------------------------------- topics

# Each topic: the words a planet's name uses for it, then words that show up in
# files about it. The first word of the first list names a new planet.
TOPICS = {
    'Recipes': ('recipes food foods cooking cook cookbook kitchen baking bake meals meal dinner lunch breakfast '
                'eats cuisine dishes snacks drinks cocktails desserts',
                'flour sugar butter salt pepper garlic onion oven preheat tbsp tsp tablespoon teaspoon cup cups '
                'grams simmer boil fry fried roast roasted ingredients ingredient serves servings chicken beef pork '
                'lamb tofu pasta noodles rice sauce soup stew salad dough knead whisk chop chopped diced minced stir '
                'saute olive lemon lime cheese parmesan egg eggs yolk cream milk yogurt vegetables veggies vegan '
                'vegetarian dessert cake cookies bread sourdough pie tart chocolate vanilla cinnamon cumin paprika '
                'basil oregano thyme rosemary ginger chili curry tomato tomatoes potato potatoes carrot mushrooms '
                'spinach avocado beans lentils chickpeas salmon fish shrimp seafood bacon sandwich burger pizza taco '
                'tacos sushi ramen dumplings brunch smoothie coffee tea wine beer cocktail syrup honey marinade grill '
                'grilled skillet pan bowl delicious tasty restaurant cafe menu bake baked baking'),
    'Music': ('music songs song tunes playlist playlists albums album bands band records vinyl tracks',
              'guitar bass drums drum piano synth vocals singer songwriter lyrics chorus verse melody chord chords '
              'tempo bpm beat beats remix mixtape producer studio record recording ep single track artist concert '
              'gig tour festival jazz rock pop punk metal hiphop rap techno house ambient classical folk soul funk '
              'disco indie spotify soundcloud bandcamp listen listening dj sample samples loop loops'),
    'Film': ('film films movie movies cinema tv shows series watchlist',
             'director directed actor actress cast scene scenes screenplay cinematography trailer premiere netflix '
             'hbo imdb letterboxd episode episodes season seasons documentary animation anime horror comedy drama '
             'thriller sequel oscar oscars criterion streaming screening watch watched'),
    'Books': ('books book reading readinglist library novels literature',
              'novel author authors chapter chapters fiction nonfiction memoir paperback hardcover kindle ebook '
              'goodreads publisher published bestseller narrator characters plot reread bookshelf bookstore read'),
    'Writing': ('writing writings poems poem poetry stories story drafts essays prose',
                'stanza verse rhyme poet narrative draft paragraph protagonist dialogue manuscript wrote write writer'),
    'Quotes': ('quotes quote quotations sayings wisdom',
               'proverb famous quoted'),
    'Travel': ('travel travels trip trips journey vacation holiday holidays places adventures wanderlust abroad',
               'flight flights airport airline hotel hostel airbnb booking itinerary passport visa luggage packing '
               'beach island city cities country tour tourist sightseeing museum map train trains roadtrip '
               'backpacking explore destination resort cruise visit visited japan tokyo kyoto osaka paris london '
               'rome italy france spain barcelona lisbon portugal berlin amsterdam iceland mexico thailand bali '
               'greece istanbul hawaii'),
    'Design': ('design designs ui ux branding typography inspo inspiration graphic graphics layouts',
               'font fonts typeface kerning grid layout logo logos brand identity palette color colours colors '
               'colour mockup mockups wireframe wireframes prototype figma adobe illustrator photoshop indesign icon '
               'icons poster posters print editorial interface website landing component components spacing '
               'whitespace minimal visual dribbble behance moodboard aesthetic'),
    'Art': ('art artwork artworks artists paintings drawings illustrations sketches',
            'painting paint painted canvas acrylic watercolor watercolour gouache drawing drew sketch sketchbook '
            'illustration illustrator artist exhibition gallery sculpture collage printmaking '
            'etching portrait abstract contemporary renaissance impressionism'),
    'Photos': ('photos photo photography pictures pics camera snapshots',
               'lens lenses 35mm aperture shutter iso exposure photographer photoshoot shoot shooting lightroom '
               'analog polaroid kodak fuji leica canon nikon'),
    'Architecture': ('architecture buildings interiors interior spaces rooms',
                     'architect building facade concrete brutalism brutalist modernist apartment furniture chair '
                     'chairs lamp sofa renovation floorplan pavilion'),
    'Fashion': ('fashion style clothes clothing outfits outfit wardrobe',
                'dress shirt shirts jacket coat jeans denim shoes sneakers boots bag bags vintage thrift wear '
                'wearing runway collection knit linen silk cotton tailoring accessories jewelry jewellery'),
    'Code': ('code coding programming dev development software scripts snippets engineering',
             'function functions const var def async await python javascript '
             'typescript java rust golang swift css sql api apis database server client frontend backend bug bugs '
             'debug deploy git github commit repo repository compile terminal command npm pip docker kubernetes '
             'algorithm array string integer null undefined regex json yaml framework react node django flask'),
    'Work': ('work job jobs career office meetings projects clients business',
             'meeting agenda deadline deadlines project client manager team colleague colleagues boss email emails '
             'proposal presentation slides quarterly report reports kpi okr roadmap stakeholder interview resume cv '
             'salary hiring onboarding contract strategy standup'),
    'Money': ('money finance finances budget budgets bills taxes investing savings',
              'budgeting expenses expense spending bank account accounts invoice invoices bill rent mortgage loan '
              'debt credit tax income paycheck stocks shares investment crypto bitcoin cost costs payment payments '
              'receipt receipts insurance'),
    'Health': ('health fitness workout workouts gym exercise wellness training running yoga',
               'exercises reps sets squat squats deadlift bench cardio stretch stretching pilates marathon calories '
               'protein diet nutrition sleep meditation therapy doctor dentist medicine symptoms vitamins'),
    'Nature': ('nature plants garden gardening outdoors wildlife flowers trees hiking',
               'plant seeds soil compost flower bloom leaves leaf tree forest woods mountain mountains river lake '
               'ocean sea hike trail camping birds bird animals moss fern succulent houseplant sunset sunrise'),
    'Science': ('science research physics biology chemistry space astronomy',
                'study studies paper papers experiment experiments hypothesis theory quantum cell cells dna gene '
                'genes molecule atoms climate evolution neuroscience brain universe galaxy planet planets stars '
                'nasa telescope orbit'),
    'Games': ('games game gaming videogames boardgames',
              'player players level levels boss quest console playstation xbox nintendo steam controller '
              'multiplayer rpg puzzle chess boardgame dnd dungeons dragons'),
    'Sports': ('sports sport football soccer basketball',
               'baseball tennis golf hockey cricket rugby match league score goal goals coach championship '
               'tournament olympics racing cycling climbing skate skateboarding surf surfing ski skiing snowboard'),
    'School': ('school study studying classes uni university college course courses lectures homework revision',
               'lecture class assignment assignments exam exams quiz semester professor teacher student students '
               'syllabus grade grades thesis dissertation campus textbook'),
    'Ideas': ('ideas idea thoughts brainstorm concepts musings',
              'concept imagine thought someday possibly invent startup app pitch'),
    'To do': ('todo todos tasks task checklist reminders errands chores groceries grocery',
              'remember remind reminder buy call schedule finish fix clean pick deadline tomorrow asap reserve '
              'renew cancel'),
    'Journal': ('journal diary journaling log daily memories reflections',
                'today yesterday tonight morning evening felt feel feeling feelings grateful gratitude mood dear '
                'woke slept happened lately weekend'),
    'Shopping': ('shopping wishlist wants gifts gift',
                 'bought price prices sale discount order ordered shipping cart amazon etsy ebay store shop product '
                 'products size'),
    'Home': ('home house apartment flat household moving diy decor',
             'ikea lease landlord move repair shelf shelves plumber cleaning laundry bathroom bedroom'),
    'People': ('people contacts friends family',
               'phone address birthday contact friend mom dad mum sister brother wife husband partner kids son '
               'daughter grandma grandpa cousin aunt uncle'),
    'Pets': ('pets pet dogs dog cats cat',
             'puppy puppies kitten kittens vet leash treats paw paws fur breed adopt adoption rabbit hamster'),
    'News': ('news politics articles',
             'election government policy president minister parliament congress senate vote voting law laws court '
             'economy war protest article headline breaking'),
    'Philosophy': ('philosophy ethics',
                   'philosopher moral morality meaning existence consciousness truth reality mind stoic stoicism '
                   'nietzsche plato aristotle kant existential metaphysics'),
    'Events': ('events plans calendar parties party',
               'event concert tickets ticket rsvp invite invitation date dates saturday sunday friday monday '
               'tuesday wednesday thursday venue'),
    'Language': ('language languages vocab vocabulary',
                 'grammar verb verbs noun nouns translation translate pronunciation spanish french german japanese '
                 'italian chinese korean portuguese duolingo fluent lesson lessons conjugation phrase phrases'),
}
TOPICS.update({
    'Crafts': ('crafts craft ceramics pottery knitting sewing making handmade woodworking',
               'ceramic clay glaze glazes kiln wheel throwing thrown stoneware porcelain earthenware slip trimming '
               'bisque raku celadon tenmoku mug mugs vase knit yarn crochet stitch stitches embroidery quilt quilting '
               'fabric pattern patterns wood carving chisel weaving loom macrame candle candles leather'),
    'Wedding': ('wedding weddings engagement',
                'bride groom engaged venue guest guests vows florist bouquet bouquets reception ceremony officiant '
                'honeymoon rings photographer catering caterer invitations bridesmaid bridesmaids hen stag '
                'marquee centrepieces'),
    'Family': ('family kids baby parenting',
               'babies pregnancy pregnant nursery toddler nappies diapers pram stroller daycare nursery school '
               'feeding naps bedtime'),
    'Beauty': ('beauty skincare makeup selfcare',
               'serum moisturiser moisturizer spf sunscreen retinol cleanser haircut nails perfume fragrance '
               'lipstick mascara'),
    'Cars': ('cars car motors vehicles bikes',
             'engine tyres tires mot mileage ev charging tesla motorbike motorcycle garage service insurance'),
    'Podcasts': ('podcasts podcast',
                 'host hosts guest interview listened subscribe'),
})
# More words for the topics above.
for _topic, _more in {
    'Recipes': 'oat oats gnocchi spaghetti lasagne risotto broth stock yeast caramel pastry croissant brownie '
               'brownies muffin pancake pancakes waffle granola porridge hummus falafel kimchi miso soy tahini feta '
               'mozzarella ricotta cheddar zest roast sheet pan tray bake braise braised poached slow cooker '
               'airfryer peppers courgette zucchini aubergine eggplant',
    'Music': 'rehearsal rehearse setlist capo amp amplifier pedal pedals bassist drummer guitarist demo mixing '
             'mastering ableton synths keyboard gigs encore riff riffs',
    'Home': 'letting agent agents deposit tenancy viewing viewings pcm bedroom bedrooms flatmate flatmates housemate '
            'rightmove zoopla estate furnished unfurnished bills council move rent rental renting',
    'Money': 'pension isa vat hmrc self assessment p60 p45 w2 1099 irs refund deductible accountant tax year '
             'allowance dividends',
    'Science': 'neuron neurons synapse synaptic receptor receptors hippocampus cortex dopamine plasticity cognitive '
               'psychology protein enzyme',
    'School': 'module modules seminar tutorial coursework notes revision week flashcards',
    'Sports': 'climbing climb boulder bouldering crag crimp crimps hangboard belay route routes overhang chalk '
              'harness rope send sent project gym',
    'Health': 'run runs 5k 10k half intervals tempo physio injury hangboard reps',
    'Photos': 'golden hour iso f/2.8 bokeh dsc',
    'Travel': 'trip itinerary hostel ryokan backpack',
    'Events': 'save dates',
    'Nature': 'prune pruning repot repotting rose roses sow sowing weed weeding mulch potting greenhouse bulbs '
              'lawn shrub shrubs hedge herbs pot pots perennials annuals seedlings cuttings fertiliser fertilizer '
              'allotment veg beds raised frost harvest',
}.items():
    TOPICS[_topic] = (TOPICS[_topic][0], TOPICS[_topic][1] + ' ' + _more)
# Topics that overlap, and by how much.
KIN = {}
for _a, _b, _k in [('Sports', 'Health', 0.6), ('Design', 'Art', 0.5), ('Art', 'Photos', 0.4), ('Crafts', 'Art', 0.5),
                   ('Architecture', 'Design', 0.4), ('Home', 'Architecture', 0.4), ('Books', 'Writing', 0.5),
                   ('Writing', 'Quotes', 0.3), ('Philosophy', 'Quotes', 0.4), ('Philosophy', 'Books', 0.3),
                   ('Travel', 'Nature', 0.3), ('School', 'Science', 0.5), ('Work', 'Money', 0.3),
                   ('Events', 'Wedding', 0.5), ('Music', 'Podcasts', 0.3), ('Fashion', 'Beauty', 0.5),
                   ('Family', 'People', 0.5), ('Ideas', 'Writing', 0.3), ('Journal', 'Writing', 0.4),
                   ('To do', 'Shopping', 0.4), ('Code', 'Work', 0.2), ('Recipes', 'Health', 0.2),
                   ('Pets', 'Nature', 0.2), ('Events', 'Music', 0.2), ('Travel', 'Events', 0.2)]:
    KIN.setdefault(_a, {})[_b] = _k
    KIN.setdefault(_b, {})[_a] = _k
COMMON_STEMS = {stem(w) for w in COMMON}
TOPIC_NAMES = {}   # stem -> topics whose planet names use it
TOPIC_WORDS = {}   # stem -> topics whose files use it
for _topic, (_names, _words) in TOPICS.items():
    for _w in _names.split():
        TOPIC_NAMES.setdefault(stem(_w), set()).add(_topic)
    for _w in (_names + ' ' + _words).split():
        TOPIC_WORDS.setdefault(stem(_w), set()).add(_topic)

# Places, so a planet called "Japan trip" knows Osaka is in Japan.
PLACES = {
    'japan': 'japanese tokyo kyoto osaka nara hiroshima hokkaido sapporo okinawa fukuoka hakone nikko kanazawa '
             'shibuya shinjuku asakusa ginza gion arashiyama dotonbori kix hnd narita haneda shinkansen ryokan onsen',
    'france': 'french paris lyon marseille nice bordeaux provence normandy brittany alsace burgundy loire',
    'italy': 'italian rome roma milan florence venice naples sicily tuscany amalfi bologna turin puglia lake como',
    'spain': 'spanish madrid barcelona seville sevilla valencia granada malaga ibiza mallorca bilbao andalusia',
    'portugal': 'portuguese lisbon porto algarve madeira azores sintra',
    'germany': 'german berlin munich hamburg cologne frankfurt bavaria',
    'netherlands': 'dutch amsterdam rotterdam utrecht hague holland',
    'uk': 'british england london manchester edinburgh glasgow scotland wales cornwall brighton bristol oxford '
          'cambridge york liverpool',
    'ireland': 'irish dublin galway cork',
    'greece': 'greek athens santorini crete mykonos rhodes corfu',
    'turkey': 'turkish istanbul cappadocia antalya izmir',
    'iceland': 'icelandic reykjavik',
    'norway': 'norwegian oslo bergen lofoten fjords',
    'sweden': 'swedish stockholm gothenburg',
    'denmark': 'danish copenhagen',
    'switzerland': 'swiss zurich geneva lucerne zermatt alps',
    'austria': 'austrian vienna salzburg innsbruck',
    'czech': 'prague',
    'hungary': 'hungarian budapest',
    'croatia': 'croatian dubrovnik split zagreb',
    'morocco': 'moroccan marrakech fez casablanca chefchaouen',
    'egypt': 'egyptian cairo luxor giza',
    'mexico': 'mexican cdmx oaxaca tulum cancun yucatan guadalajara',
    'usa': 'america american york nyc brooklyn manhattan california los angeles san francisco chicago seattle '
           'boston miami texas austin hawaii vegas portland',
    'canada': 'canadian toronto vancouver montreal quebec banff',
    'brazil': 'brazilian rio janeiro sao paulo',
    'argentina': 'buenos aires patagonia mendoza',
    'peru': 'peruvian lima cusco machu picchu',
    'thailand': 'thai bangkok chiang mai phuket krabi',
    'vietnam': 'vietnamese hanoi saigon hoi halong',
    'indonesia': 'bali jakarta ubud lombok',
    'china': 'chinese beijing shanghai hong kong',
    'korea': 'korean seoul busan',
    'india': 'indian delhi mumbai goa jaipur kerala',
    'australia': 'australian sydney melbourne brisbane perth',
    'zealand': 'auckland wellington queenstown',
}
PLACES = {stem(country): {stem(w) for w in places.split()} for country, places in PLACES.items()}
for _country, _places in PLACES.items():
    for _w in _places | {_country}:
        TOPIC_WORDS.setdefault(_w, set()).add('Travel')

# Websites that say what a link is about.
SITE_TOPICS = {
    'spotify.com': 'Music', 'soundcloud.com': 'Music', 'bandcamp.com': 'Music', 'music.apple.com': 'Music',
    'genius.com': 'Music', 'discogs.com': 'Music', 'pitchfork.com': 'Music', 'last.fm': 'Music',
    'imdb.com': 'Film', 'letterboxd.com': 'Film', 'netflix.com': 'Film', 'mubi.com': 'Film',
    'rottentomatoes.com': 'Film', 'criterion.com': 'Film',
    'goodreads.com': 'Books', 'bookshop.org': 'Books', 'gutenberg.org': 'Books', 'storygraph.com': 'Books',
    'github.com': 'Code', 'gitlab.com': 'Code', 'stackoverflow.com': 'Code', 'developer.mozilla.org': 'Code',
    'npmjs.com': 'Code', 'pypi.org': 'Code', 'codepen.io': 'Code', 'huggingface.co': 'Code',
    'dribbble.com': 'Design', 'behance.net': 'Design', 'figma.com': 'Design', 'fonts.google.com': 'Design',
    'awwwards.com': 'Design', 'itsnicethat.com': 'Design', 'savee.it': 'Design', 'are.na': 'Design',
    'allrecipes.com': 'Recipes', 'bonappetit.com': 'Recipes', 'seriouseats.com': 'Recipes',
    'epicurious.com': 'Recipes', 'cooking.nytimes.com': 'Recipes', 'food52.com': 'Recipes',
    'bbcgoodfood.com': 'Recipes', 'smittenkitchen.com': 'Recipes', 'budgetbytes.com': 'Recipes',
    'airbnb.com': 'Travel', 'booking.com': 'Travel', 'tripadvisor.com': 'Travel', 'lonelyplanet.com': 'Travel',
    'skyscanner.net': 'Travel', 'maps.google.com': 'Travel', 'maps.app.goo.gl': 'Travel',
    'arxiv.org': 'Science', 'nature.com': 'Science', 'sciencedirect.com': 'Science', 'nasa.gov': 'Science',
    'amazon.com': 'Shopping', 'amazon.co.uk': 'Shopping', 'etsy.com': 'Shopping', 'ebay.com': 'Shopping',
    'artsy.net': 'Art', 'moma.org': 'Art', 'tate.org.uk': 'Art', 'metmuseum.org': 'Art',
    'archdaily.com': 'Architecture', 'dezeen.com': 'Architecture',
    'store.steampowered.com': 'Games', 'itch.io': 'Games', 'ign.com': 'Games', 'boardgamegeek.com': 'Games',
    'strava.com': 'Health',
    'nytimes.com': 'News', 'bbc.co.uk': 'News', 'bbc.com': 'News', 'theguardian.com': 'News',
    'reuters.com': 'News', 'apnews.com': 'News',
    'vogue.com': 'Fashion', 'ssense.com': 'Fashion',
}

# What kind of thing it is, and what planets named after a kind are called.
KIND_GROUPS = {'image': 'Images', 'video': 'Videos', 'audio': 'Sounds', 'pdf': 'Reading', 'doc': 'Reading',
               'link': 'Links', 'text': 'Notes', 'code': 'Code', 'archive': 'Files', 'other': 'Files'}
NOTE_EXTS = {'txt', 'md', 'markdown', 'rtf', 'text'}
GROUP_NAMES = {
    'Images': 'images image photos photo pictures picture pics pic gallery screenshots',
    'Videos': 'videos video clips clip footage',
    'Sounds': 'sounds sound audio recordings voice memos',
    'Reading': 'reading documents docs papers pdfs articles readings',
    'Links': 'links link bookmarks websites sites web',
    'Notes': 'notes note text texts thoughts writing jottings',
    'Code': 'code scripts snippets',
    'Files': 'files stuff misc downloads',
}
GROUP_NAMES = {group: {stem(w) for w in names.split()} for group, names in GROUP_NAMES.items()}


def group_of(kind, ext):
    if kind == 'doc' and ext in NOTE_EXTS:
        return 'Notes'  # a text file is a note that came as a file
    return KIND_GROUPS.get(kind, 'Files')


# ---------------------------------------------------------------- the shape of a note

QUANTITY_RE = re.compile(r'\b\d+(?:[./]\d+)?\s*(?:g|kg|ml|l|oz|lb|lbs|cups?|tbsp|tsp|tablespoons?|teaspoons?|'
                         r'grams?|cloves?|pinch)\b', re.I)
CHECKBOX_RE = re.compile(r'^\s*(?:[-*]\s*)?(?:\[[ xX]?\]|☐|☑|✅|✓|✔)', re.M)
BULLET_RE = re.compile(r'^\s*(?:[-*•·]|\d+[.)])\s+\S', re.M)
QUOTE_RE = re.compile(r'^\s*["“‘«\'].{6,}?["”’»\']\s*(?:[-–—―~,]*\s*[A-Z][\w.\' ]{1,40})?\s*$', re.S)
CREDIT_RE = re.compile(r'(?:^|\n)\s*(?:[-–—~]{1,2}|―)\s*[A-Z][\w.\' ]{1,40}\s*$')
DATE_LEAD_RE = re.compile(r'^\s*(?:\d{1,4}[./-]\d{1,2}[./-]\d{1,4}|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s|'
                          r'(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2})', re.I)
PHONE_RE = re.compile(r'(?:\+?\d[\d ().-]{7,}\d)')
EMAIL_RE = re.compile(r'\b[\w.+-]+@[\w-]+\.[\w.]+\b')
CODE_RE = re.compile(r'(?:[{};]\s*$|^\s*(?:def|class|function|const|let|var|import|from|return|if|for|while)\b'
                     r'.*[(:{=]|=>|</?\w+[^>]*>)', re.M)
TODO_VERBS = set('buy call email text book pick ring pay send finish fix clean return cancel schedule renew '
                 'order get make print sign submit post reply check wash charge water feed collect drop'.split())


def shape(text, ext=''):
    """Clues from how a note is written rather than what it says: topic -> weight."""
    found = Counter()
    text = (text or '').strip()
    if not text:
        return found
    lines = [ln for ln in text.splitlines() if ln.strip()]
    short = len(text) < 600
    if CHECKBOX_RE.search(text) or re.match(r'\s*(?:to ?do|tasks?)\b', text, re.I):
        found['To do'] += 5
    bullets = len(BULLET_RE.findall(text))
    if bullets >= 3 and bullets >= len(lines) * 0.6 and sum(len(ln) for ln in lines) / len(lines) < 60:
        found['To do'] += 1.5
    first = (words(lines[0][:40]) or [''])[0] if lines else ''
    if short and len(lines) <= 6 and first in TODO_VERBS:
        found['To do'] += 2.5
    if short and (QUOTE_RE.match(text) or (CREDIT_RE.search(text) and len(lines) <= 6)):
        found['Quotes'] += 5
    quantities = len(QUANTITY_RE.findall(text))
    if quantities >= 2 or re.search(r'\bingredients?\b', text, re.I):
        found['Recipes'] += 2 + min(quantities, 6) * 0.5
    code_lines = len(CODE_RE.findall(text))
    if ext in CODE_EXTS or (len(lines) >= 2 and code_lines >= max(2, len(lines) * 0.3)):
        found['Code'] += 5
    per_line = sum(len(ln.split()) for ln in lines) / len(lines)
    if len(lines) >= 3 and per_line <= 3 and not code_lines and not re.search(r'[.!?;]\s', text):
        found['To do'] += 4  # a list of things (shopping, packing)
    elif (len(lines) >= 4 and not code_lines and per_line >= 3 and sum(len(ln) for ln in lines) / len(lines) < 48
            and text.count('. ') <= len(lines) / 3 and bullets < 2 and not quantities):
        found['Writing'] += 3
    if DATE_LEAD_RE.match(text) or re.match(r'\s*dear (?:diary|journal)', text, re.I):
        found['Journal'] += 2.5
    mine = len(re.findall(r'\b(?:I|I\'m|I\'ve|my|me)\b', text))
    if len(text) > 200 and mine / max(1, len(text.split())) > 0.06:
        found['Journal'] += 1.5
    if re.match(r'\s*(?:idea|what if|how about|imagine)\b', text, re.I):
        found['Ideas'] += 3.5
    if short and (PHONE_RE.search(text) and EMAIL_RE.search(text)):
        found['People'] += 3
    return found


CODE_EXTS = set('js mjs cjs ts tsx jsx py rb go rs java kt swift c h cc cpp hpp cs php css scss sass less sh bash '
                'zsh sql lua r vue svelte ipynb'.split())


# ---------------------------------------------------------------- reading what's inside

TEXT_LIMIT = 60_000
TAG_RE = re.compile(r'<[^>]+>')


def read_text(path, ext, texty):
    """The readable text inside a stored file, as well as can be done without
    any libraries. Empty when there's nothing to read."""
    try:
        if texty:
            with open(path, 'rb') as f:
                text = f.read(TEXT_LIMIT * 2).decode('utf-8', 'replace').replace('\x00', '')
            if ext in ('html', 'htm', 'xml', 'svg'):
                text = TAG_RE.sub(' ', text)
            return text[:TEXT_LIMIT]
        if ext == 'ipynb':
            with open(path, 'rb') as f:
                cells = json.loads(f.read(4_000_000)).get('cells', [])
            return '\n'.join(''.join(c.get('source', [])) for c in cells)[:TEXT_LIMIT]
        if ext in ('docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'epub', 'pages', 'key', 'numbers'):
            return _zip_text(path)
        if ext == 'rtf':
            with open(path, 'rb') as f:
                return _rtf_text(f.read(2_000_000).decode('latin-1'))
        if ext == 'pdf':
            with open(path, 'rb') as f:
                return _pdf_text(f.read(20_000_000))
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError, KeyError, AttributeError, TypeError):
        pass
    return ''


def _xml_text(xml):
    xml = re.sub(r'</(?:w:p|a:p|text:p|text:h|p|h\d|li|div|si|row)>', '\n', xml)
    xml = re.sub(r'<(?:w:tab|text:tab|br)\b[^>]*/?>', ' ', xml)
    text = TAG_RE.sub('', xml)
    for entity, char in (('&lt;', '<'), ('&gt;', '>'), ('&quot;', '"'), ('&apos;', "'"), ('&#39;', "'"),
                         ('&amp;', '&')):
        text = text.replace(entity, char)
    return re.sub(r'[ \t]+', ' ', text)


def _zip_text(path):
    parts, size = [], 0
    with zipfile.ZipFile(path) as z:
        names = z.namelist()

        def slide_no(name):
            m = re.search(r'(\d+)\.xml$', name)
            return int(m.group(1)) if m else 0
        wanted = (['word/document.xml'] + sorted([n for n in names if re.match(r'ppt/slides/slide\d+\.xml$', n)],
                                                  key=slide_no)
                  + ['xl/sharedStrings.xml', 'content.xml', 'index.xml']
                  + sorted(n for n in names if re.search(r'\.x?html?$', n) and 'nav' not in n.lower())[:40])
        for name in wanted:
            if name not in names:
                continue
            info = z.getinfo(name)
            if info.file_size > 30_000_000:
                continue
            parts.append(_xml_text(z.read(name).decode('utf-8', 'replace')))
            size += len(parts[-1])
            if size > TEXT_LIMIT:
                break
    return '\n'.join(parts)[:TEXT_LIMIT]


def _rtf_text(rtf):
    rtf = re.sub(r'\{\\\*[^{}]*\}', '', rtf)
    rtf = re.sub(r"\\'[0-9a-f]{2}", '', rtf)
    rtf = re.sub(r'\\par[d]?\b', '\n', rtf)
    rtf = re.sub(r'\\[a-z]+-?\d* ?', '', rtf)
    return re.sub(r'[{}]', '', rtf)[:TEXT_LIMIT]


PDF_STRING_RE = re.compile(rb'\((?:\\.|[^\\)])*\)|-?\d+(?:\.\d+)?|T[Jj*]|\'|"', re.S)
PDF_INFO_RE = re.compile(rb'/(Title|Subject|Keywords)\s*\(((?:\\.|[^\\)]){1,400})\)')


def _pdf_unescape(raw):
    out = re.sub(rb'\\([nrtbf()\\]|[0-7]{1,3})', lambda m: {
        b'n': b'\n', b'r': b' ', b't': b' ', b'b': b'', b'f': b'', b'(': b'(', b')': b')', b'\\': b'\\',
    }.get(m.group(1), bytes([int(m.group(1), 8) & 255]) if m.group(1)[:1].isdigit() else b''), raw)
    return out.decode('latin-1')


def _pdf_text(data):
    """Text drawn with plain strings in a PDF. PDFs whose fonts are stored as
    numbered glyphs (common from Google Docs) give nothing; those still sort by
    name, title and the rest."""
    found = [_pdf_unescape(m.group(2)) for m in PDF_INFO_RE.finditer(data[:2_000_000])
             if not m.group(2).startswith(b'\xfe\xff')]
    total, unpacked = 0, 0
    for m in re.finditer(rb'stream\r?\n', data):
        if unpacked > 60_000_000:
            break  # mostly pictures; enough
        end = data.find(b'endstream', m.end())
        if end < 0:
            break
        head = data[max(0, m.start() - 300):m.start()]
        raw = data[m.end():end]
        if b'FlateDecode' in head[head.rfind(b'obj'):]:
            try:
                raw = zlib.decompressobj().decompress(raw, 4_000_000)
            except zlib.error:
                continue
            unpacked += len(raw)
        elif b'/Filter' in head[head.rfind(b'obj'):]:
            continue  # pictures and other encodings
        if b'BT' not in raw:
            continue
        line = []
        for token in PDF_STRING_RE.findall(raw):
            if token[:1] == b'(':
                line.append(_pdf_unescape(token[1:-1]))
            elif token[:1].isdigit() or token[:1] == b'-':
                if float(token) < -180:
                    line.append(' ')  # a wide gap between letters is a space
            elif token in (b'T*', b"'", b'"'):
                line.append('\n')
            elif token == b'Tj' or token == b'TJ':
                line.append(' ' if token == b'Tj' else '')
        text = ''.join(line)
        total += len(text)
        found.append(text)
        if total > TEXT_LIMIT:
            break
    text = '\n'.join(found)
    tokens = TOKEN_RE.findall(text)
    if not tokens:
        return ''
    wordlike = sum(1 for t in tokens if len(t) > 1 and t.isalpha() and re.search(r'[aeiouyAEIOUY]', t))
    return text[:TEXT_LIMIT] if wordlike / len(tokens) > 0.55 else '\n'.join(found[:1])


def gist(text, limit=60):
    """The words that say most about a long text, kept on the file so it can be
    compared (and searched) later without reading it again."""
    counts = Counter(w for w in words(text) if not w.isdigit())
    return ' '.join(w for w, _ in counts.most_common(limit))


# ---------------------------------------------------------------- what a file is about

class Doc:
    """One file, boiled down."""
    __slots__ = ('id', 'kind', 'group', 'ext', 'site', 'heads', 'body', 'lead', 'topics', 'look', 'terms')

    def __init__(self, row, extra='', limit=20000):
        meta = json.loads(row['meta'] or '{}')
        self.id = row['id']
        self.kind = row['kind']
        self.ext = (row['ext'] or '').lower()
        self.group = group_of(self.kind, self.ext)
        self.site = (meta.get('domain') or '').lower()
        title = row['title'] or ''
        file_name = (row['file_name'] or '').rsplit('.', 1)[0]
        name = ' '.join([title, file_name if file_name.lower() != title.lower() else '', row['description'] or ''])
        content = row['content'] or ''
        if self.kind == 'text':
            body = content[:limit]
            lines = content.strip().splitlines()
            lead = ' '.join(lines[:1])[:160]
        else:
            path = urlpath(content) if self.kind == 'link' else ''
            inside = extra[:limit] or ' '.join(filter(None, [meta.get('excerpt'), meta.get('gist')]))
            body = ' '.join(filter(None, [meta.get('description'), meta.get('siteName'), meta.get('keywords'),
                                          path, inside]))
            lead = (meta.get('excerpt') or extra or '')[:160]
        self.heads = Counter(stems(name))
        self.body = Counter(stems(body))
        self.lead = set(stems(lead))
        self.topics = topic_scores(self, shape(content if self.kind == 'text' else (extra or meta.get('excerpt')),
                                              self.ext))
        self.look = meta.get('look') if isinstance(meta.get('look'), dict) else None
        # Weighted words, the name counting most.
        self.terms = Counter()
        for word, n in self.heads.items():
            self.terms[word] += 3 * (1 + math.log(n)) * (0.3 if word in COMMON_STEMS else 1)
        for word, n in self.body.items():
            self.terms[word] += (1 + math.log(n)) * (0.3 if word in COMMON_STEMS else 1)
        if self.site:
            self.terms['@' + self.site] += 2


def urlpath(url):
    parts = re.split(r'[/?#=&._-]+', re.sub(r'^https?://[^/]+', '', url or ''))
    return ' '.join(p for p in parts if not re.fullmatch(r'[0-9a-f]{6,}|\d+', p, re.I))


def site_topic(site):
    parts = site.split('.')
    for i in range(len(parts) - 1):
        topic = SITE_TOPICS.get('.'.join(parts[i:]))
        if topic:
            return topic
    return None


def topic_scores(doc, clues):
    """How much a file is about each topic, from its words, website and shape."""
    raw = Counter(clues)
    for bag, weight in ((doc.heads, 3.0), (doc.body, 1.0)):
        for word, n in bag.items():
            topics = TOPIC_WORDS.get(word)
            if topics:
                share = weight * (1 + math.log(n)) / len(topics)
                for topic in topics:
                    raw[topic] += share * (1.5 if word in TOPIC_NAMES else 1)
    site = site_topic(doc.site) if doc.site else None
    if site:
        raw[site] += 4
    if doc.group == 'Code':
        raw['Code'] += 3
    return raw


def topic_profile(raw):
    """(unit vector over topics, how sure)."""
    total = sum(raw.values())
    if not total:
        return {}, 0.0
    norm = math.sqrt(sum(v * v for v in raw.values()))
    sure = (1 - math.exp(-max(raw.values()) / 3)) * (max(raw.values()) / total) ** 0.5
    return {t: v / norm for t, v in raw.items()}, sure


# ---------------------------------------------------------------- what a planet is about

class Planet:
    def __init__(self, row, members, vecs, terms):
        self.id = row['id']
        self.title = row['title'] or ''
        self.name = set(stems(self.title))
        self.about = Counter(stems(self.title))
        for word, n in Counter(stems(row['description'] or '')).items():
            self.about[word] += 0.5 * n
        self.members = members
        self.named_group = next((g for g, names in GROUP_NAMES.items()
                                 if self.name and self.name <= names | {'my', 'all'}), None)
        raw = Counter()
        for word in self.name:
            for topic in TOPIC_NAMES.get(word, ()):
                raw[topic] += 6 / len(TOPIC_NAMES[word])
            for topic in TOPIC_WORDS.get(word, ()):
                raw[topic] += 4 / len(TOPIC_WORDS[word])
        for word, n in self.about.items():
            if word not in self.name:
                for topic in TOPIC_WORDS.get(word, ()):
                    raw[topic] += 0.5 * n / len(TOPIC_WORDS[word])
        for m in members:
            # Files on it that are clearly about something pull its topics that way.
            vec, sure = topic_profile(m.topics)
            for t, v in vec.items():
                raw[t] += 10 * v * sure / max(2, len(members))
        self.topics = topic_profile(raw)[0]
        self.vecs = [vecs[m.id] for m in members]
        self.df = Counter()
        for block_id in {m.id for m in members}:
            self.df.update(terms[block_id].keys())
        self.groups = Counter(m.group for m in members)
        self.exts = Counter(m.ext for m in members if m.ext)
        self.sites = Counter(m.site for m in members if m.site)


# ---------------------------------------------------------------- comparing

def cosine(a, b):
    if len(a) > len(b):
        a, b = b, a
    return sum(v * b.get(k, 0) for k, v in a.items())


def topic_match(a, b):
    """How alike two topic mixes are, with neighbouring topics (climbing
    training is sport and health) counting partly."""
    total = 0.0
    for topic, v in a.items():
        total += v * (b.get(topic, 0) + sum(k * b.get(other, 0) for other, k in KIN.get(topic, {}).items()))
    return min(1.0, total)


def unit(vec):
    norm = math.sqrt(sum(v * v for v in vec.values()))
    return {k: v / norm for k, v in vec.items()} if norm else {}


def name_match(doc, planet):
    """Does the file use the planet's name? 1 for its title, less for a mention."""
    if not planet.name:
        return 0.0
    hits = []
    words_in = len(doc.body)
    for word in planet.name:
        if word in doc.heads:
            hit = 1.0
        elif any(len(word) >= 5 and len(w) >= 5 and (w.startswith(word) or word.startswith(w)) for w in doc.heads):
            hit = 0.8
        elif PLACES.get(word, set()) & doc.heads.keys():
            hit = 0.75
        elif PLACES.get(word, set()) & doc.body.keys():
            hit = 0.6
        elif word in doc.body:
            n = doc.body[word]
            hit = 0.45 + 0.15 * min(2, n - 1)
            if n == 1 and words_in > 150:
                hit = 0.3
            if word in doc.lead:
                hit = min(0.9, hit + 0.2)
        else:
            hit = 0.0
        hits.append(hit)
    return 0.7 * max(hits) + 0.3 * sum(hits) / len(hits)


def look_match(doc, planet):
    if not doc.look or doc.look.get('v') != 2:
        return 0.0
    sims = []
    for m in planet.members:
        if not m.look or m.look.get('v') != 2:
            continue
        a, b = doc.look.get('colors') or {}, m.look.get('colors') or {}
        colors = sum(min(v, b.get(k, 0)) for k, v in a.items())
        ta, tb = set(doc.look.get('tags') or []), set(m.look.get('tags') or [])
        tags = len(ta & tb) / len(ta | tb) if ta | tb else 0
        sims.append(0.6 * colors + 0.4 * tags)
    if not sims:
        return 0.0
    sims.sort(reverse=True)
    return sum(sims[:3]) / len(sims[:3])


MEDIA = {'Images', 'Videos', 'Sounds'}


def evidence(doc, terms, vec_doc, planet, idf, df):
    """Each kind of clue that the file belongs on this planet, from 0 to 1."""
    n = len(planet.members)
    clues = {'name': name_match(doc, planet)}

    vec, sure = topic_profile(doc.topics)
    clues['topic'] = topic_match(vec, planet.topics) * sure if planet.topics else 0.0

    total = Counter()
    for vec_m in planet.vecs:
        for k, v in vec_m.items():
            total[k] += v
    for k, v in unit({w: c * idf.get(w, 1) for w, c in planet.about.items()}).items():
        total[k] += 2 * v  # the planet's own name and note count like two files
    centroid = cosine(vec_doc, unit(total))
    near = sorted((cosine(vec_doc, vec_m) for vec_m in planet.vecs), reverse=True)[:2]
    nearest = sum(near) / len(near) if near else 0.0
    # Words of the file that, among all your files, live mostly on this planet
    # ('shakshuka' when your one shakshuka note is on Recipes).
    own = known = 0.0
    for word, weight in terms.items():
        if df.get(word):
            known += weight * idf[word]
            own += weight * idf[word] * planet.df[word] / df[word]
    everything = sum(weight * idf.get(word, 1) for word, weight in terms.items()) or 1
    owned = own / known * min(1.0, 2.5 * known / everything) if known else 0.0
    clues['content'] = max(min(1.0, (0.5 * centroid + 0.5 * nearest) / 0.3), 0.9 * owned)

    if n:
        group = planet.groups[doc.group] / n
        ext = planet.exts[doc.ext] / n if doc.ext else group
        clues['kind'] = (0.7 * group + 0.3 * ext) * min(1.0, n / 3)
    else:
        clues['kind'] = 0.0
    clues['named'] = 1.0 if planet.named_group == doc.group else 0.0
    clues['site'] = min(1.0, planet.sites[doc.site] / 2) if doc.site else 0.0
    clues['look'] = look_match(doc, planet)
    return clues


def weights(doc):
    media = doc.group in MEDIA
    return {'name': 0.85, 'topic': 0.7, 'content': 0.75, 'site': 0.55, 'look': 0.3,
            'kind': 0.5 if media else 0.25, 'named': 0.55 if media else 0.5}


FITS = 0.34   # fits well enough whatever else there is
CLEAR = 0.22  # or, with something specific, fits clearly better than any other planet
SPECIFIC = ('name', 'topic', 'content', 'site', 'look')


def score(doc, terms, vec_doc, planet, idf, df):
    """How well the file fits, 0 to 1: the clues combine like independent
    witnesses, so one strong clue or several weaker ones are both enough."""
    clues = evidence(doc, terms, vec_doc, planet, idf, df)
    miss = 1.0
    for clue, weight in weights(doc).items():
        miss *= 1 - weight * clues[clue]
    # A file that's clearly about one thing fits less well on a planet that's
    # clearly about another (a poem mentioning salt isn't a recipe).
    vec, sure = topic_profile(doc.topics)
    if sure and planet.topics and not clues['name']:
        miss = 1 - (1 - miss) * (1 - 0.4 * sure * (1 - topic_match(vec, planet.topics)))
    clues['specific'] = 1 - math.prod(1 - w * clues[c] for c, w in weights(doc).items()
                                      if c in SPECIFIC or doc.group in MEDIA)
    return 1 - miss, clues


# ---------------------------------------------------------------- choosing

_members = {}  # (block id, updated_at) -> Doc; files on planets rarely change


def member(row):
    key = (row['id'], row['updated_at'], row['meta'])
    doc = _members.get(key)
    if doc is None:
        if len(_members) > 20000:
            _members.clear()
        doc = _members[key] = Doc(row, limit=5000)
    return doc


PER_PLANET = 150


def pick(conn, user_id, row, extra='', explain=None):
    """Where a file belongs: (drawer id, None), or (None, title) for a new planet."""
    doc = Doc(row, extra)
    planets = conn.execute('SELECT id, title, description FROM drawers WHERE user_id = ? AND parent_id IS NULL '
                           'ORDER BY updated_at DESC', (user_id,)).fetchall()
    members = {p['id']: [] for p in planets}
    for r in conn.execute(
            'SELECT * FROM (SELECT c.drawer_id, b.id, b.kind, b.title, b.description, b.content, b.file_name, '
            'b.ext, b.meta, b.updated_at, ROW_NUMBER() OVER (PARTITION BY c.drawer_id '
            'ORDER BY c.connected_at DESC) AS rn FROM connections c JOIN blocks b ON b.id = c.block_id '
            'JOIN drawers d ON d.id = c.drawer_id WHERE d.user_id = ? AND d.parent_id IS NULL AND b.id != ?) WHERE rn <= ?',
            (user_id, row['id'], PER_PLANET)):
        members[r['drawer_id']].append(member(r))

    # How telling each word is: rare across your files means telling.
    docs = {m.id: m for ms in members.values() for m in ms}
    docs[doc.id] = doc
    terms = {i: d.terms for i, d in docs.items()}
    df = Counter()
    for t in terms.values():
        df.update(t.keys())
    idf = {w: math.log((len(docs) + 4) / (c + 0.5)) for w, c in df.items()}
    vecs = {i: unit({w: v * idf[w] for w, v in t.items()}) for i, t in terms.items()}
    df.subtract(terms[doc.id].keys())  # from here on: how many files on planets use each word

    ranked = []
    for i, p in enumerate(planets):
        planet = Planet(p, members[p['id']], vecs, terms)
        fit, clues = score(doc, terms[doc.id], vecs[doc.id], planet, idf, df)
        # A hair's preference for planets used lately, only to break ties.
        ranked.append((fit + 0.004 * (len(planets) - i) / len(planets), fit, planet, clues))
    ranked.sort(key=lambda r: r[0], reverse=True)
    if explain is not None:
        explain.extend((p.title, round(fit, 3), {k: round(v, 2) for k, v in clues.items() if v})
                       for _, fit, p, clues in ranked)
    if ranked:
        best, runner_up = ranked[0][1], (ranked[1][1] if len(ranked) > 1 else 0.0)
        if best >= FITS or (best >= CLEAR and best - runner_up >= 0.06 and best >= 1.3 * runner_up
                            and ranked[0][3]['specific'] >= 0.1):
            return ranked[0][2].id, None
    title = new_title(doc)
    same = next((p['id'] for p in planets if p['title'].strip().lower() == title.lower()), None)
    return (same, None) if same else (None, title)


def new_title(doc):
    """A name for a new planet: what the file is about, if that's clear,
    otherwise what kind of thing it is."""
    vec, sure = topic_profile(doc.topics)
    if vec and sure >= 0.45:
        return max(vec, key=vec.get)
    return doc.group
