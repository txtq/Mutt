"""What words mean, for autosort and for reading what a planet is for.

Data only; mutt/sorting.py does the reading. Every list is plain words, stemmed
when loaded, so 'baking', 'baked' and 'bake' all count.

- TOPICS: broad subjects. The first list is what a planet's name calls it, the
  second is words that show up in files about it. A topic's key names a new
  planet made for it.
- CONCEPTS: finer subjects inside a topic (running inside Health, typography
  inside Design), so two planets on one topic can still be told apart.
- ROLES: what a planet is used for, whatever it's about (collecting things,
  making your own work, planning something, ticking off tasks...).
"""

# Filler words that say nothing about a file.
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
# of your planets a file shares words with, and a planet named with one of
# them ("Morning pages") isn't matched by every file that uses it.
COMMON = set('''
day days week weeks month months year years time times today tomorrow yesterday tonight morning night people
person thing lot bit part place point case fact kind sort type number group world life hand eye head side end
line level area good great nice bad best better worse big small little large long short high low old young first
second third last early late right left different same important able true real whole full free hard easy fine
amazing incredible awesome cool lovely love loved liked wanted thought knew feel felt look looked looking find
found give gave tell told ask asked try tried start started finish finished kept leave turn turned show showed
move moved live lived happen happened two three four five six seven eight nine ten twenty hundred thousand
million half lots maybe probably definitely actually basically pretty super totally new stuff page pages
evening weekend light dark things idea ideas monday tuesday wednesday thursday friday saturday sunday mon tue
tues wed weds thu thur thurs fri sat sun january february march april june july august september october
november december jan feb mar apr jun jul aug sep sept oct nov dec
'''.split())

SHORT_OK = {'ai', 'ux', 'ui', 'tv', '3d', 'dj', 'vr', 'ar', 'ml', 'js', 'uk', 'eu', 'ny', 'la', 'bbq', 'diy', 'gp',
            'pr', 'cv', 'go', 'c4d', 'mot', 'ev', 'tbr', 'wip', 'xp', 'pc', 'ps5', 'f1', 'nba', 'nfl', 'ufc', 'mma',
            'pt', 'iso', 'lp', 'ep', 'rsvp', 'bpm', 'aoc'}

# Words that mean something else in a planet's name than in everyday writing,
# rewritten before reading.
ALIASES = {
    'inspo': 'inspiration', 'refs': 'references', 'ref': 'references', 'recs': 'recommendations',
    'tbr': 'reading', 'faves': 'favourites', 'favs': 'favourites', 'favorites': 'favourites',
    'xmas': 'christmas', 'bday': 'birthday', 'hw': 'homework', 'uni': 'university', 'diy': 'diy',
    'wip': 'wip', 'todo': 'todo', 'todos': 'todo', 'groc': 'groceries', 'vacay': 'vacation',
    'ttrpg': 'dnd', 'aoc': 'advent', 'recipies': 'recipes', 'receipes': 'recipes', 'pix': 'pictures',
    'mtg': 'meeting', 'mtgs': 'meetings', 'appt': 'appointment', 'appts': 'appointments',
    'screenshot': 'screenshot', 'screenshots': 'screenshot',
}

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
                'grilled skillet pan bowl delicious tasty restaurant cafe menu bake baked baking oat oats gnocchi '
                'spaghetti lasagne risotto broth stock yeast caramel pastry croissant brownie brownies muffin pancake '
                'pancakes waffle granola porridge hummus falafel kimchi miso soy tahini feta mozzarella ricotta '
                'cheddar zest roast sheet tray braise braised poached slow cooker airfryer peppers courgette zucchini '
                'aubergine eggplant fillet fillets capers turmeric coriander cilantro parsley dill chives shallot '
                'shallots leek leeks bicarb buttermilk wholemeal pecorino guanciale carbonara bolognese stout shin '
                'tins tin coconut chickpea dal daal tagine katsu bibimbap pho stirfry wok noodle crispy roasting '
                'nutmeg cardamom saffron sesame sriracha harissa pesto vinaigrette dressing glaze icing '
                'biscuits scones crumble custard pudding meringue pavlova sorbet gelato chia berries blueberries '
                'raspberries strawberries banana bananas apple apples pear lemons limes oranges'),
    'Music': ('music songs song tunes playlist playlists albums album bands band records vinyl tracks',
              'guitar bass drums drum piano synth vocals singer songwriter lyrics chorus verse melody chord chords '
              'tempo bpm beat beats remix mixtape producer studio record recording ep single track artist concert '
              'gig tour festival jazz rock pop punk metal hiphop rap techno house ambient classical folk soul funk '
              'disco indie spotify soundcloud bandcamp listen listening dj sample samples loop loops rehearsal '
              'rehearse setlist capo amp amplifier pedal pedals bassist drummer guitarist demo mixing mastering '
              'ableton synths keyboard gigs encore riff riffs'),
    'Film': ('film films movie movies cinema tv shows series watchlist',
             'director directed actor actress cast scene scenes watch screenplay cinematography trailer premiere netflix '
             'hbo imdb letterboxd episode episodes season seasons documentary animation anime horror comedy drama '
             'thriller sequel oscar oscars criterion streaming watched mubi'),
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
               'backpacking explore destination resort cruise visit visited trip itinerary hostel ryokan backpack '
               'onsen lagoon'),
    'Design': ('design designs ui ux branding typography inspiration graphic graphics layouts',
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
               'analog polaroid kodak fuji leica canon nikon golden bokeh sony mirrorless dslr sensor raw edits '
               'godox #mm'),
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
              'receipt receipts insurance pension isa vat hmrc assessment p60 p45 w2 1099 irs refund deductible '
              'accountant allowance dividends'),
    'Health': ('health fitness workout workouts gym exercise wellness training running yoga',
               'exercises reps sets squat squats deadlift bench cardio stretch stretching pilates marathon calories '
               'protein diet nutrition sleep meditation therapy doctor dentist medicine symptoms vitamins injury'),
    'Nature': ('nature plants garden gardening outdoors wildlife flowers trees hiking',
               'plant seeds soil compost flower bloom leaves leaf tree forest woods mountain mountains river lake '
               'ocean sea hike trail camping birds bird animals moss fern succulent houseplant sunset sunrise'),
    'Science': ('science research physics biology chemistry space astronomy',
                'study studies paper papers experiment experiments hypothesis theory quantum cell cells dna gene '
                'genes molecule atoms climate evolution neuroscience brain universe galaxy planet planets stars '
                'nasa telescope orbit neuron neurons synapse synaptic receptor receptors hippocampus cortex dopamine '
                'plasticity cognitive psychology enzyme'),
    'Games': ('games game gaming videogames boardgames',
              'player players level levels boss quest console playstation xbox nintendo steam controller '
              'multiplayer rpg puzzle chess boardgame dnd dungeons dragons'),
    'Sports': ('sports sport football soccer basketball',
               'baseball tennis golf hockey cricket rugby match league score goal goals coach championship '
               'tournament olympics racing skate skateboarding surf surfing ski skiing snowboard swimming swim '
               'pool lengths'),
    'School': ('school study studying classes university college course courses lectures homework revision',
               'lecture class assignment assignments exam exams quiz semester professor teacher student students '
               'syllabus grade grades thesis dissertation campus textbook module modules seminar tutorial '
               'coursework flashcards'),
    'Ideas': ('ideas idea thoughts brainstorm concepts musings',
              'concept imagine thought someday possibly invent startup app pitch'),
    'To do': ('todo tasks task checklist reminders errands chores groceries grocery',
              'remember remind reminder buy call schedule finish fix clean pick deadline tomorrow asap reserve '
              'renew cancel'),
    'Journal': ('journal diary journaling log daily memories reflections',
                'today yesterday tonight morning evening felt feel feeling feelings grateful gratitude mood dear '
                'woke slept happened lately weekend'),
    'Shopping': ('shopping wishlist wants gifts gift',
                 'bought price prices sale discount order ordered shipping cart amazon etsy ebay store shop product '
                 'products size'),
    'Home': ('home house apartment flat household moving diy decor',
             'ikea lease landlord bills move repair shelf shelves plumber cleaning laundry bathroom bedroom letting agent '
             'agents deposit tenancy viewing viewings pcm bedrooms flatmate flatmates housemate rightmove zoopla '
             'estate furnished unfurnished council rent rental renting'),
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
               'event concert tickets ticket rsvp invite invitation save date dates saturday sunday friday monday '
               'tuesday wednesday thursday venue'),
    'Language': ('language languages vocab vocabulary japanese spanish french german italian korean mandarin chinese español espanol français francais deutsch italiano '
                 'portugues português nihongo 日本語 한국어 中文',
                 'grammar verb verbs noun nouns translation translate pronunciation spanish french german japanese '
                 'italian chinese korean portuguese duolingo fluent lesson lessons conjugation phrase phrases'),
    'Crafts': ('crafts craft ceramics pottery knitting sewing making handmade woodworking',
               'ceramic clay glaze glazes kiln wheel throwing thrown stoneware porcelain earthenware slip trimming '
               'bisque raku celadon tenmoku mug mugs vase knit yarn crochet stitch stitches embroidery quilt quilting '
               'fabric pattern patterns wood carving chisel weaving loom macrame candle candles leather wax wick '
               'wicks scented'),
    'Wedding': ('wedding weddings engagement',
                'bride groom engaged venue photographer invitations guest guests vows florist bouquet bouquets reception ceremony officiant '
                'honeymoon rings catering caterer bridesmaid bridesmaids hen stag marquee centrepieces'),
    'Family': ('family kids baby parenting twins children',
               'babies pregnancy pregnant nursery toddler nappies diapers pram stroller daycare '
               'feeding naps bedtime'),
    'Beauty': ('beauty skincare makeup selfcare',
               'serum moisturiser moisturizer spf sunscreen retinol cleanser haircut nails perfume fragrance '
               'lipstick mascara'),
    'Cars': ('cars car motors vehicles motorbikes',
             'engine tyres tires mot mileage ev charging tesla motorbike motorcycle garage service'),
    'Podcasts': ('podcasts podcast',
                 'host hosts guest interview listened subscribe episode episodes'),
}

# Finer subjects. Each: (its topic, words a planet's name uses for it, words
# files about it use). A concept's words count for its topic too.
CONCEPTS = {
    # food
    'baking': ('Recipes', 'baking bakes sourdough bread breads cakes pastry patisserie',
               'loaf loaves dough knead proving prove starter levain crumb hydration autolyse retard scoring '
               'banneton flour yeast cake cakes sponge bake baked pastry tart scones cookies brownies muffins '
               'drizzle icing'),
    'meal planning': ('Recipes', 'mealprep meals',
                      'batch leftovers portion portions lunches prep mealprep tupperware'),
    'cooking': ('Recipes', 'recipes cooking dinners mains',
                'simmer fry roast saute chop dice tbsp tsp fillet cloves tin tins serves pan skillet oven stir '
                '#qty'),
    'drinks': ('Recipes', 'drinks cocktails coffee wine',
               'cocktail gin vodka rum whisky whiskey vermouth bitters espresso latte cappuccino pourover v60 '
               'aeropress wine beer ipa'),
    'restaurants': ('Recipes', 'restaurants eats food',
                    'restaurant cafe bistro tasting reservation brunch michelin'),
    # music
    'instruments': ('Music', 'bass guitar piano drums synth instruments',
                    'tab tabs fret frets capo strings flatwounds roundwounds slap plectrum amp pedal pedals preamp '
                    'fuzz overdrive distortion pickup pickups scale scales arpeggio arpeggios metronome groove '
                    'ostinato chord chords fingerstyle bassline basslines tuner tuning fender ampeg darkglass'),
    'live music': ('Music', 'gigs tour concerts setlists',
                   'gig gigs setlist venue venues soundcheck headline encore tour van promoter merch rider stage'),
    'recording': ('Music', 'demos recordings tracks mixes',
                  'demo demos mixdown mastering daw ableton logic protools stems vocal vocals mic '
                  'microphone overdub wav m4a'),
    'songwriting': ('Music', 'lyrics songs songwriting',
                    'lyric lyrics verse chorus bridge hook melody rhyme song songs'),
    'records': ('Music', 'vinyl records albums crate',
                'vinyl lp lps record records pressing reissue discogs album albums crate turntable'),
    'music admin': ('Music', 'prs royalties',
                    'prs ppl royalties royalty splits publishing sync licensing registration distrokid'),
    # writing and books
    'fiction': ('Writing', 'novel manuscript chapters story stories fiction',
                'chapter chapters character characters plot scene scenes protagonist backstory dialogue pov ending '
                'reveal subplot draft redraft manuscript narrator villain arc'),
    'poetry': ('Writing', 'poems poetry verse',
               'poem poems stanza stanzas haiku sonnet pamphlet'),
    'submissions': ('Writing', 'submissions pitches',
                    'submission submissions submitted rejected rejection accepted acceptance editor editors '
                    'magazine magazines literary pitch query agent agents granta rialto'),
    'reading list': ('Books', 'reading books tbr',
                     'tbr goodreads storygraph novel author paperback hardcover'),
    # design and art
    'typography': ('Design', 'type typography fonts typefaces lettering',
                   'font fonts typeface typefaces serif sans grotesk grotesque italic italics bold kerning glyph '
                   'glyphs foundry specimen pairing headline headlines monospace'),
    'branding': ('Design', 'branding brand identity logos',
                 'brand identity logo logos wordmark rebrand rebrands guidelines'),
    'interface design': ('Design', 'ui ux interfaces',
                         'ui ux app interface wireframe wireframes prototype onboarding dashboard component '
                         'components figma screens usability'),
    'print': ('Design', 'zine zines print editorial magazine publication',
              'zine zines print riso risograph spread spreads layout editorial magazine paper fluoro offset '
              'printing printer copies imposition bleed'),
    '3d': ('Design', '3d blender modelling cgi',
           'blender 3d render rendering renders modelling modeling mesh shader shaders nodes texture textures uv '
           'sculpt sculpting polygon quads subdivision c4d cinema4d donut keyframe bsdf'),
    'painting': ('Art', 'paintings painting oils watercolours',
                 'oil oils acrylic acrylics watercolour watercolor gouache canvas palette brush brushes '
                 'underpainting plein still portrait varnish'),
    'drawing': ('Art', 'drawings drawing sketchbook sketches sketching inktober',
                'sketch sketches sketchbook ink pen pencil charcoal gesture inktober brush'),
    'art history': ('Art', 'museums galleries exhibitions',
                    'museum gallery exhibition retrospective tate moma artsy hockney rothko klint painter painters'),
    'sculpture': ('Art', 'sculpture sculptures sculpting',
                  'sculpture sculptures sculpt sculpted bronze marble plinth maquette armature casting cast '
                  'carve carved carving installation'),
    'printmaking': ('Art', 'printmaking prints linocuts woodcuts etchings screenprints',
                    'print prints printmaking linocut linocuts lino woodcut woodcuts etching etchings intaglio '
                    'drypoint aquatint screenprint screenprints screenprinting monotype monoprint brayer baren '
                    'edition editions proof proofs plate plates relief gouge press'),
    'ceramics': ('Crafts', 'ceramics pottery clay',
                 'ceramic ceramics clay glaze glazes glazing kiln wheel throwing thrown stoneware porcelain '
                 'earthenware slip trimming bisque raku celadon tenmoku mug mugs vase bowl bowls'),
    'illustration': ('Art', 'illustration illustrations comics zines characters',
                     'illustration illustrations illustrated character characters comic comics panel panels '
                     'procreate cartoon manga storyboard picturebook'),
    'textiles': ('Crafts', 'knitting sewing embroidery textiles crochet quilting',
                 'knit knitting knitted yarn wool crochet stitch stitches embroidery embroidered quilt quilting '
                 'fabric sewing sew seam hem pattern patterns weaving loom tapestry'),
    'woodwork': ('Crafts', 'woodwork woodworking carpentry',
                 'wood timber oak walnut ash joinery dovetail chisel plane lathe turning spoon carving sanding'),
    'jewellery': ('Crafts', 'jewellery jewelry rings',
                  'ring rings necklace earrings bracelet silver gold solder silversmith gemstone beads pendant'),
    'photography': ('Photos', 'photography photos',
                    'lens aperture shutter iso exposure roll rolls developed portra'),
    'portraits': ('People', 'portraits headshots selfies',
                  'portrait portraits headshot headshots selfie selfies face faces sitter'),
    'dogs': ('Pets', 'dogs dog puppy', 'dog dogs puppy puppies walkies lead leash bark kennel'),
    'cats': ('Pets', 'cats cat kitten', 'cat cats kitten kittens litter purr meow'),
    # code
    'programming languages': ('Code', 'rust python javascript swift golang',
                              'rust python javascript typescript golang kotlin swift ruby haskell elixir cpp '
                              'struct structs trait traits impl enum enums borrow borrowing ownership lifetime '
                              'lifetimes compiler generics generic closure closures iterator iterators pointer '
                              'macro macros cargo crate crates rustlings fn mut println'),
    'software bugs': ('Code', 'bugs',
                      'bug bugs crash crashes error errors exception stack trace repro flicker flickers regression'),
    'devops': ('Code', 'infra devops',
               'deploy deploys docker kubernetes ci pipeline server servers aws'),
    'puzzles': ('Code', 'advent leetcode puzzles katas',
                'advent puzzle puzzles input solution solutions leetcode kata'),
    # work
    'meetings': ('Work', 'meetings standups',
                 'standup standups agenda sync retro sprint attendees actions'),
    'career': ('Work', 'career',
               'promo promotion performance salary interview interviews cv resume hiring'),
    'day job': ('Work', '',
                'oncall rota incident incidents handover pr prs migration ticket tickets jira paged queue webhook'),
    'freelance': ('Work', 'freelance clients commissions',
                  'client clients invoice invoices proposal brief rates contract fee deliverables retainer feedback '
                  'chase commission'),
    # money
    'tax': ('Money', 'taxes tax',
            'tax hmrc irs assessment p60 p45 vat allowance pension declare'),
    'budgeting': ('Money', 'budget budgets spending',
                  'budget spending spent savings categories'),
    'investing': ('Money', 'investing investments',
                  'stocks shares etf funds dividends isa broker crypto'),
    # health
    'running': ('Health', 'running runs marathon parkrun',
                'run runs running km mile miles pace intervals 5k 10k marathon parkrun strava splits jog #distance'),
    'strength': ('Health', 'gym lifting strength',
                 'gym bench squat squats deadlift deadlifts ohp reps leg dips lunges kettlebell barbell dumbbell '
                 'pushdowns curls #sets #weight'),
    'medical': ('Health', 'medical doctors',
                'gp doctor dentist blood prescription symptoms appointment hospital vitamin physio shoulder knee pain '
                'referral nhs'),
    'mental health': ('Health', 'therapy',
                      'therapy therapist anxiety meditation stress'),
    # nature
    'gardening': ('Nature', 'garden gardening allotment veg',
                  'seeds sow sowing soil compost veg beds raised tomatoes allotment prune pruning weed mulch '
                  'greenhouse harvest frost bulbs lawn roses herbs plot dig cloche cloches netting slugs blight '
                  'germinate germination seedlings overwinter overwintering dahlias brassicas sets plant planted '
                  'planting rows courgettes squash runner'),
    'houseplants': ('Nature', 'plants houseplants',
                    'monstera pothos calathea fiddle ficus succulent succulents cactus cacti repot repotting '
                    'humidity mist misting watering cuttings propagate propagation windowsill houseplant '
                    'indirect roots rooting leaves leaf pot pots radiator'),
    'outdoors': ('Nature', 'hiking outdoors',
                 'hike hikes trail trails summit camping birds birding'),
    # sport
    'cycling': ('Sports', 'bike bikes cycling bicycle',
                'bike bikes cycling ride rides derailleur cassette chain chainring gears brakes pads tyre tyres '
                'puncture saddle wheel wheels spokes cleats sportive kmc shimano sram #distance'),
    'climbing': ('Sports', 'climbing bouldering',
                 'climb climbing boulder bouldering crag crags crimp crimps hangboard belay overhang chalk harness '
                 'rope flashed onsight onsighted redpoint topout abseil gritstone ukc'),
    'football': ('Sports', 'football soccer',
                 'match league goal goals striker keeper premier fixture fixtures penalty kick derby nil var '
                 'spurs tottenham arsenal chelsea everton villa newcastle wolves brentford fulham palace '
                 'celtic rangers barca madrid juventus bayern'),
    # home
    'renting': ('Home', 'flat renting rental',
                'landlord tenancy rent deposit letting agent lease flatmate viewing pcm bills boiler'),
    'renovation': ('Home', 'renovation renovations extension',
                   'builder builders quote quotes extension kitchen bathroom tiles tile zellige plaster plastering '
                   'plumber electrician joiner steel beam permission loft flooring skirting worktop cabinets'),
    'household': ('Home', 'household chores',
                  'cleaning laundry bins recycling hoover boiler repair broken leak extractor'),
    # people and family
    'kids': ('Family', 'kids children baby',
             'nursery school pickup vaccines booster mmr parents playdate bedtime nappy nappies uniform toddler'),
    'gifts': ('Shopping', 'gifts presents',
              'gift gifts present presents voucher wrap wrapped'),
    # events
    'christmas': ('Events', 'christmas',
                  'christmas turkey stocking stockings crackers mince'),
    'birthdays': ('Events', 'birthday birthdays',
                  'birthday party 30th 40th 50th 60th'),
    # travel and film
    'trip planning': ('Travel', 'trip trips travel holiday',
                      'flights flight booked booking hotel hostel airbnb itinerary hire passport visa luggage '
                      'packing gate'),
    'watchlist': ('Film', 'watchlist',
                  'watch film films movie imdb letterboxd'),
}

# Emoji in a planet's name (or a note) and what they stand for: a topic or a concept.
EMOJI = {
    '🌱': 'houseplants', '🪴': 'houseplants', '🌿': 'houseplants', '🌵': 'houseplants', '🌸': 'Nature',
    '🌻': 'gardening', '🌷': 'gardening', '🥕': 'gardening', '🍅': 'gardening', '🌳': 'Nature', '🌲': 'Nature',
    '🏔': 'outdoors', '⛰': 'outdoors', '🥾': 'outdoors', '🏕': 'outdoors',
    '🍳': 'Recipes', '🍝': 'Recipes', '🍜': 'Recipes', '🍲': 'Recipes', '🥘': 'Recipes', '🥗': 'Recipes',
    '🍰': 'baking', '🎂': 'baking', '🍞': 'baking', '🥐': 'baking', '🧁': 'baking', '🍪': 'baking',
    '☕': 'drinks', '🍷': 'drinks', '🍸': 'drinks', '🍺': 'drinks', '🍽': 'Recipes', '🥑': 'Recipes',
    '🎵': 'Music', '🎶': 'Music', '🎸': 'instruments', '🎹': 'instruments', '🥁': 'instruments', '🎤': 'Music',
    '🎧': 'Music', '💿': 'records', '📀': 'records', '🎙': 'Podcasts',
    '🎬': 'Film', '🎥': 'Film', '🍿': 'Film', '📺': 'Film',
    '📚': 'Books', '📖': 'Books', '📕': 'Books', '✍': 'Writing', '🖋': 'Writing', '📝': 'Writing',
    '✈': 'Travel', '🌍': 'Travel', '🌎': 'Travel', '🌏': 'Travel', '🗺': 'Travel', '🧳': 'Travel',
    '🏖': 'Travel', '🗾': 'Travel',
    '🎨': 'Art', '🖌': 'painting', '🖼': 'Art', '✏': 'drawing', '🖍': 'drawing',
    '📷': 'Photos', '📸': 'Photos',
    '💻': 'Code', '👩‍💻': 'Code', '👨‍💻': 'Code', '🐍': 'programming languages', '🦀': 'programming languages',
    '💼': 'Work', '📊': 'Work', '📈': 'investing',
    '💰': 'Money', '💸': 'Money', '💷': 'Money', '💵': 'Money', '🧾': 'tax',
    '🏃': 'running', '🏃‍♀️': 'running', '🏃‍♂️': 'running', '🏋': 'strength', '💪': 'strength',
    '🧘': 'Health', '❤': 'Health', '🩺': 'medical', '💊': 'medical',
    '🚲': 'cycling', '🚴': 'cycling', '🧗': 'climbing', '⚽': 'football', '🎾': 'Sports', '🏀': 'Sports',
    '🎮': 'Games', '🕹': 'Games', '🎲': 'Games', '♟': 'Games',
    '🎓': 'School', '🏫': 'School', '📐': 'School',
    '💡': 'Ideas', '🧠': 'Ideas', '✅': 'To do', '☑': 'To do', '📋': 'To do', '🛒': 'To do',
    '📓': 'Journal', '📔': 'Journal', '🛍': 'Shopping', '🎁': 'gifts',
    '🏠': 'Home', '🏡': 'Home', '🔨': 'renovation', '🛠': 'renovation',
    '👪': 'Family', '👶': 'kids', '🐶': 'Pets', '🐕': 'Pets', '🐱': 'Pets', '🐈': 'Pets',
    '📰': 'News', '🎉': 'Events', '🎄': 'christmas', '💍': 'Wedding', '💒': 'Wedding',
    '🧶': 'Crafts', '🧵': 'Crafts', '🏺': 'Crafts', '💄': 'Beauty', '💅': 'Beauty', '👗': 'Fashion',
    '👟': 'Fashion', '🚗': 'Cars', '🔬': 'Science', '🔭': 'Science', '🧪': 'Science', '🪐': 'Science',
}

# Words for people from a place: a planet called "Japanese" isn't a trip.
NATIONALITIES = set('''japanese french italian spanish portuguese german dutch british irish greek turkish icelandic
norwegian swedish danish swiss austrian hungarian croatian moroccan egyptian mexican american canadian brazilian
peruvian thai vietnamese chinese korean indian australian'''.split())

# Little words that give away a note written in (or about) another language.
FOREIGN = {
    'spanish': 'que el la los las del por para con una uno es estar ser muy pero como esta este yo tu usted '
               'nosotros quiero espero ojalá también porque cuando donde hay',
    'french': 'le la les des une est sont avec pour dans pas mais que qui je tu nous vous très aussi être avoir',
    'german': 'der die das und ist nicht mit für auf ich du wir sie ein eine sein haben auch aber oder',
    'italian': 'il lo gli della che non per con una sono essere avere anche molto perché',
}

# Topics that overlap, and by how much.
KIN_PAIRS = [
    ('Sports', 'Health', 0.6), ('Design', 'Art', 0.5), ('Art', 'Photos', 0.4), ('Crafts', 'Art', 0.5),
    ('Architecture', 'Design', 0.4), ('Home', 'Architecture', 0.4), ('Books', 'Writing', 0.5),
    ('Writing', 'Quotes', 0.3), ('Philosophy', 'Quotes', 0.4), ('Philosophy', 'Books', 0.3),
    ('Travel', 'Nature', 0.3), ('School', 'Science', 0.5), ('Work', 'Money', 0.3),
    ('Events', 'Wedding', 0.5), ('Music', 'Podcasts', 0.3), ('Fashion', 'Beauty', 0.5),
    ('Family', 'People', 0.5), ('Ideas', 'Writing', 0.3), ('Journal', 'Writing', 0.4),
    ('To do', 'Shopping', 0.4), ('Code', 'Work', 0.2), ('Recipes', 'Health', 0.2),
    ('Pets', 'Nature', 0.2), ('Events', 'Music', 0.2), ('Travel', 'Events', 0.2),
    ('Shopping', 'Fashion', 0.3), ('Shopping', 'People', 0.2), ('Events', 'People', 0.2),
    ('Family', 'Health', 0.2), ('Home', 'Money', 0.2), ('Design', 'Code', 0.2), ('Music', 'Writing', 0.2),
]

# Places, so a planet called "Japan trip" knows Osaka is in Japan.
PLACES = {
    'japan': 'japanese tokyo kyoto osaka nara hiroshima hokkaido sapporo okinawa fukuoka hakone nikko kanazawa '
             'shibuya shinjuku asakusa ginza gion arashiyama dotonbori kix hnd narita haneda shinkansen ryokan onsen '
             'kurama nishiki fushimi inari',
    'france': 'french paris lyon marseille nice bordeaux provence normandy brittany alsace burgundy loire',
    'italy': 'italian rome roma milan florence venice naples sicily tuscany amalfi bologna turin puglia lake como',
    'spain': 'spanish madrid barcelona seville sevilla valencia granada malaga ibiza mallorca bilbao andalusia',
    'portugal': 'portuguese lisbon porto algarve madeira azores sintra alfama',
    'germany': 'german berlin munich hamburg cologne frankfurt bavaria',
    'netherlands': 'dutch amsterdam rotterdam utrecht hague holland',
    'uk': 'british england london manchester edinburgh glasgow scotland wales cornwall brighton bristol oxford '
          'cambridge york liverpool leeds birmingham',
    'ireland': 'irish dublin galway cork',
    'greece': 'greek athens santorini crete mykonos rhodes corfu',
    'turkiye': 'turkish istanbul cappadocia antalya izmir',
    'iceland': 'icelandic reykjavik kef vik jokulsarlon golden circle',
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

# Websites that say what a link is about.
SITE_TOPICS = {
    'spotify.com': 'Music', 'soundcloud.com': 'Music', 'bandcamp.com': 'Music', 'music.apple.com': 'Music',
    'genius.com': 'Music', 'discogs.com': 'records', 'pitchfork.com': 'Music', 'last.fm': 'Music',
    'thomann.de': 'instruments', 'reverb.com': 'instruments', 'gak.co.uk': 'instruments',
    'podcasts.apple.com': 'Podcasts', 'pocketcasts.com': 'Podcasts', 'overcast.fm': 'Podcasts',
    'imdb.com': 'Film', 'letterboxd.com': 'Film', 'netflix.com': 'Film', 'mubi.com': 'Film',
    'rottentomatoes.com': 'Film', 'criterion.com': 'Film',
    'goodreads.com': 'Books', 'bookshop.org': 'Books', 'gutenberg.org': 'Books', 'storygraph.com': 'Books',
    'github.com': 'Code', 'gitlab.com': 'Code', 'stackoverflow.com': 'Code', 'developer.mozilla.org': 'Code',
    'npmjs.com': 'Code', 'pypi.org': 'Code', 'codepen.io': 'Code', 'huggingface.co': 'Code',
    'doc.rust-lang.org': 'programming languages', 'docs.python.org': 'programming languages',
    'adventofcode.com': 'puzzles', 'leetcode.com': 'puzzles',
    'dribbble.com': 'Design', 'behance.net': 'Design', 'figma.com': 'Design', 'fonts.google.com': 'typography',
    'awwwards.com': 'Design', 'itsnicethat.com': 'Design', 'savee.it': 'Design', 'are.na': 'Design',
    'klim.co.nz': 'typography', 'commercialtype.com': 'typography', 'abcdinamo.com': 'typography',
    'grillitype.com': 'typography', 'colophon-foundry.org': 'typography', 'typewolf.com': 'typography',
    'pangrampangram.com': 'typography', 'fontsinuse.com': 'typography',
    'allrecipes.com': 'Recipes', 'bonappetit.com': 'Recipes', 'seriouseats.com': 'Recipes',
    'epicurious.com': 'Recipes', 'cooking.nytimes.com': 'Recipes', 'food52.com': 'Recipes',
    'bbcgoodfood.com': 'Recipes', 'smittenkitchen.com': 'Recipes', 'budgetbytes.com': 'Recipes',
    'ottolenghi.co.uk': 'Recipes', 'jamieoliver.com': 'Recipes', 'deliciousmagazine.co.uk': 'Recipes',
    'airbnb.com': 'trip planning', 'booking.com': 'trip planning', 'tripadvisor.com': 'Travel',
    'lonelyplanet.com': 'Travel', 'japan-guide.com': 'Travel', 'skyscanner.net': 'trip planning',
    'maps.google.com': 'Travel', 'maps.app.goo.gl': 'Travel', 'timeout.com': 'Travel',
    'arxiv.org': 'Science', 'nature.com': 'Science', 'sciencedirect.com': 'Science', 'nasa.gov': 'Science',
    'amazon.com': 'Shopping', 'amazon.co.uk': 'Shopping', 'etsy.com': 'Shopping', 'ebay.com': 'Shopping',
    'ebay.co.uk': 'Shopping', 'uniqlo.com': 'Fashion', 'cos.com': 'Fashion', 'patagonia.com': 'Fashion',
    'artsy.net': 'art history', 'moma.org': 'art history', 'tate.org.uk': 'art history',
    'metmuseum.org': 'art history', 'royalacademy.org.uk': 'art history',
    'archdaily.com': 'Architecture', 'dezeen.com': 'Architecture',
    'store.steampowered.com': 'Games', 'itch.io': 'Games', 'ign.com': 'Games', 'boardgamegeek.com': 'Games',
    'strava.com': 'Sports', 'sheldonbrown.com': 'cycling', 'bikeradar.com': 'cycling', 'wiggle.com': 'cycling',
    'ukclimbing.com': 'climbing',
    'nytimes.com': 'News', 'bbc.co.uk': 'News', 'bbc.com': 'News', 'theguardian.com': 'News',
    'reuters.com': 'News', 'apnews.com': 'News',
    'vogue.com': 'Fashion', 'ssense.com': 'Fashion',
    'rightmove.co.uk': 'Home', 'zoopla.co.uk': 'Home', 'ikea.com': 'Home', 'houzz.com': 'renovation',
    'nhs.uk': 'medical', 'gov.uk': 'Money', 'duolingo.com': 'Language',
}
# Shops: a link to one is something you might buy.
SHOP_SITES = {'amazon.com', 'amazon.co.uk', 'etsy.com', 'ebay.com', 'ebay.co.uk', 'thomann.de', 'reverb.com',
              'uniqlo.com', 'cos.com', 'patagonia.com', 'ssense.com', 'ikea.com', 'wiggle.com', 'gak.co.uk',
              'johnlewis.com', 'argos.co.uk', 'muji.com', 'zara.com', 'asos.com', 'endclothing.com'}

# What a planet is for, whatever it's about. Words in a planet's name that say so.
ROLES = {
    'collecting': 'inspiration references moodboard mood saved likes favourites collection gallery archive '
                  'recommendations bookmarks links screenshot clippings scrapbook finds pins swipe '
                  'references',
    'making': 'portfolio wip drafts draft demos demo sketchbook novel zine project projects manuscript poems lyrics '
              'stories speech script scripts '
              'songs paintings drawings illustrations chapters',
    'planning': 'trip wedding party birthday christmas holiday holidays move moving renovation build tour plans '
                'planning prep honeymoon launch event events gigs',
    'tasks': 'todo tasks task errands chores groceries checklist reminders list lists shopping',
    'logging': 'log logs journal diary tracker tracking habits entries daily progress',
    'learning': 'learning learn course courses class classes lectures lecture study studying revision tutorial '
                'tutorials lessons lesson school university homework',
    'keeping': 'admin taxes tax receipts documents paperwork bills insurance contracts invoices records finances '
               'accounts accounting bookkeeping expenses '
               'important passport certificates warranty manuals',
    'wanting': 'wishlist wants want gifts gift buy wishlists',
}
# Some role words only mean that role next to others ("to try", "to read").
ROLE_PHRASES = {
    'collecting': [r'\bto (?:try|read|watch|listen|visit|see|cook)\b', r'\bi like\b', r'\bstuff i\b', r'\breading\b'],
    'making': [r'\bmy (?:art|work|paintings?|drawings?|songs?|music|photos|writing|poems?|designs?)\b',
               r'\bour recipes\b'],
    'planning': [r'\b20[2-3]\d\b', r'\bideas for\b'],
    'tasks': [r'\bto ?do\b', r'\bshopping list\b'],
    'logging': [r'\bmorning pages\b'],
    'wanting': [r'\bgift ideas\b', r'\bto buy\b', r'\bwish ?list\b'],
}

# What kind of thing it is, and what planets named after a kind are called.
KIND_GROUPS = {'image': 'Images', 'video': 'Videos', 'audio': 'Sounds', 'pdf': 'Reading', 'doc': 'Reading',
               'link': 'Links', 'text': 'Notes', 'code': 'Code', 'archive': 'Files', 'other': 'Files'}
GROUP_NAMES = {
    'Images': 'images image photos photo pictures picture pics pic gallery',
    'Screenshots': 'screenshot screenshots screens grabs',
    'Videos': 'videos video clips clip footage',
    'Sounds': 'sounds sound audio recordings voice memos',
    'Reading': 'reading documents docs papers pdfs articles readings',
    'Links': 'links link bookmarks websites sites web',
    'Notes': 'notes note text texts thoughts writing jottings',
    'Code': 'code scripts snippets',
    'Files': 'files stuff misc downloads',
}


# ---------------------------------------------------------------- what a picture shows
# Pictures are read in the browser by a small on-device model (CLIP) that
# turns a picture into numbers; the server compares those with these
# descriptions (turned into numbers once, ahead of time, into sights.json by
# tools/make_sights.py; rerun it after changing anything here).
#
# MEDIUMS: what kind of picture it is.   name: (topic, concept, 'description; description')
# SIGHTS:  what it shows.               name: (topic, concept, 'description; description')
MEDIUMS = {
    'photo': (None, None, 'a photograph; a candid phone photo; a photo taken with a camera; a snapshot; '
                       'a photo of a person; a photo of people at an event; a photo of an animal; '
                       'a photo of an object; a photo of a place; a black and white photograph; '
                       'a product photo of an object on a plain background; a photo of a sculpture or pot in a '
                       'museum; a photo of a musical instrument'),
    'painting': ('Art', 'painting', 'an oil painting; a watercolour painting; an acrylic painting on canvas; '
                                    'a gouache painting'),
    'drawing': ('Art', 'drawing', 'a pencil drawing; a sketch in a sketchbook; an ink drawing; a charcoal drawing'),
    'print': ('Art', 'printmaking', 'a linocut print; a woodcut print; an etching; a screen print; '
                                    'a risograph print; a relief print in black ink'),
    'illustration': ('Art', 'illustration', 'a digital illustration; a cartoon illustration; concept art; '
                                            'a character design'),
    'comic': ('Art', 'illustration', 'a comic strip; a page of a comic book; a manga page'),
    'render': ('Design', '3d', 'a 3d render; a computer generated 3d model; a blender render'),
    'pixel art': ('Art', 'illustration', 'pixel art; an 8-bit pixel art sprite'),
    'collage': ('Art', None, 'a collage of cut paper; a mixed media collage'),
    'screenshot': (None, None, 'a screenshot of a phone app; a screenshot of a website; a screenshot of a '
                               'computer screen; a screenshot of a text message conversation; a screenshot of a '
                               'social media post'),
    'document': (None, None, 'a scanned document; a printed letter; a page of printed text; a form with boxes '
                             'to fill in; a contract'),
    'receipt': ('Money', None, 'a shop receipt; a till receipt; an invoice; a bill'),
    'handwriting': (None, None, 'handwritten notes on lined paper; a page of handwriting in pen; '
                                'a handwritten list on paper'),
    'diagram': ('Science', None, 'a diagram; a chart or graph; an infographic; a flowchart'),
    'map': ('Travel', None, 'a map; a street map; a hiking map'),
    'sheet music': ('Music', 'instruments', 'a page of sheet music with notes on staves; a printed musical score'),
    'graphic design': ('Design', 'print', 'a graphic design poster; a flyer; a magazine layout; a book cover design'),
    'logo': ('Design', 'branding', 'a logo; a brand mark on a plain background; a wordmark'),
    'interface': ('Design', 'interface design', 'a mobile app interface design; a website design mockup; '
                                                'a user interface wireframe'),
    'meme': (None, None, 'a meme with caption text; a funny internet meme'),
}

SIGHTS = {
    # art and making
    'sculpture': ('Art', 'sculpture', 'a sculpture; a statue; a bronze sculpture; a marble statue; '
                                      'a sculpture in a gallery'),
    'pottery': ('Crafts', 'ceramics', 'handmade pottery; a ceramic vase; a ceramic bowl; pots on a pottery wheel; '
                                      'glazed ceramics'),
    'gallery': ('Art', 'art history', 'an art gallery exhibition; paintings hanging on a gallery wall; '
                                      'visitors in an art museum'),
    'studio': ('Art', None, 'an artist studio with paints and brushes; an artist at work'),
    'printing': ('Art', 'printmaking', 'carving a linocut block; inking a printing block with a roller; '
                                       'a printing press'),
    'knitting': ('Crafts', 'textiles', 'knitting with yarn and needles; a knitted jumper; balls of yarn; '
                                       'crochet; embroidery on a hoop'),
    'sewing': ('Crafts', 'textiles', 'a sewing machine with fabric; sewing a garment; a quilt'),
    'woodwork': ('Crafts', 'woodwork', 'woodworking in a workshop; a handmade wooden chair; carving wood'),
    'jewellery': ('Crafts', 'jewellery', 'handmade jewellery; a silver ring; earrings and a necklace'),
    'candles': ('Crafts', None, 'handmade candles; a scented candle in a jar'),
    # people
    'portrait': ('People', 'portraits', 'a portrait of a person; a close-up photo of a face; a headshot'),
    'selfie': ('People', 'portraits', 'a selfie'),
    'friends': ('People', None, 'a group of friends; people smiling together; a group photo'),
    'baby': ('Family', 'kids', 'a baby; a toddler; young children playing'),
    'wedding': ('Wedding', None, 'a wedding ceremony; a bride and groom; a wedding dress; a wedding reception'),
    'party': ('Events', 'birthdays', 'a birthday party with balloons and cake; people dancing at a party'),
    'christmas': ('Events', 'christmas', 'a christmas tree; christmas decorations; wrapped christmas presents'),
    'concert': ('Music', 'live music', 'a rock concert; a band playing on stage; a crowd at a gig'),
    # sport and moving
    'climbing': ('Sports', 'climbing', 'rock climbing on a cliff; bouldering in a climbing gym; a climber on a '
                                       'climbing wall; climbing holds'),
    'running': ('Health', 'running', 'a runner running a race; people running a marathon; running shoes'),
    'cycling': ('Sports', 'cycling', 'a cyclist riding a road bike; a bicycle; a mountain biker'),
    'football': ('Sports', 'football', 'a football match; soccer players on a pitch; a football stadium'),
    'gym': ('Health', 'strength', 'lifting weights in a gym; a barbell and dumbbells; a squat rack'),
    'yoga': ('Health', None, 'a person doing yoga on a mat; a yoga class'),
    'swimming': ('Sports', None, 'swimming in a pool; a swimmer in open water'),
    'skiing': ('Sports', None, 'skiing down a snowy slope; a snowboarder'),
    'surfing': ('Sports', None, 'surfing a wave; a surfboard on the beach'),
    'skateboarding': ('Sports', None, 'skateboarding; a skateboarder at a skatepark'),
    'tennis': ('Sports', None, 'a tennis match; a tennis racket and ball'),
    'hiking': ('Nature', 'outdoors', 'a hiker walking on a mountain trail with a backpack; a tent at a campsite'),
    # food
    'meal': ('Recipes', 'cooking', 'a plate of food; a home cooked meal; a bowl of pasta; a curry'),
    'baking': ('Recipes', 'baking', 'a loaf of bread; a cake; pastries and cookies; sourdough bread'),
    'ingredients': ('Recipes', 'cooking', 'fresh vegetables and ingredients on a kitchen counter; '
                                          'cooking in a frying pan'),
    'drinks': ('Recipes', 'drinks', 'a cocktail; a cup of coffee; a glass of wine; a pint of beer'),
    'restaurant': ('Recipes', 'restaurants', 'a restaurant interior; a meal at a restaurant table; a cafe'),
    # nature and animals
    'landscape': ('Nature', 'outdoors', 'a landscape; mountains; a forest; a lake; a field at sunset'),
    'beach': ('Travel', None, 'a beach; the sea; a seaside town'),
    'garden': ('Nature', 'gardening', 'a vegetable garden; an allotment with raised beds; flowers growing in a '
                                      'garden; seedlings in pots; tomato plants'),
    'houseplant': ('Nature', 'houseplants', 'a houseplant in a pot; indoor plants on a windowsill; a monstera'),
    'flowers': ('Nature', None, 'a bouquet of flowers; a close-up of a flower'),
    'birds': ('Nature', 'outdoors', 'a bird; a bird on a branch'),
    'wildlife': ('Nature', None, 'a wild animal; a deer; a fox'),
    'night sky': ('Science', None, 'the night sky with stars; the moon; the milky way'),
    'dog': ('Pets', 'dogs', 'a dog; a puppy'),
    'cat': ('Pets', 'cats', 'a cat; a kitten'),
    'pet': ('Pets', None, 'a pet rabbit; a hamster; a pet in a cage'),
    # places and home
    'city': ('Travel', None, 'a city street; a famous landmark; tourists sightseeing; a temple or shrine'),
    'travel': ('Travel', 'trip planning', 'an airport; a view from an airplane window; a hotel room; '
                                          'a suitcase packed for a trip; a train station'),
    'architecture': ('Architecture', None, 'a modern building; architecture; a concrete building; '
                                           'an architectural model'),
    'interior': ('Home', None, 'a living room interior; a cosy bedroom; a kitchen interior; furniture'),
    'renovation': ('Home', 'renovation', 'a room being renovated; building work inside a house; '
                                         'tiles and plaster; a building site'),
    # things
    'car': ('Cars', None, 'a car; a classic car; a car engine; a car dashboard'),
    'motorbike': ('Cars', None, 'a motorbike; a motorcycle'),
    'guitar': ('Music', 'instruments', 'an electric guitar; a bass guitar; an acoustic guitar; guitar pedals'),
    'keys': ('Music', 'instruments', 'a piano; a synthesizer; a keyboard instrument'),
    'drums': ('Music', 'instruments', 'a drum kit'),
    'recording studio': ('Music', 'recording', 'a music recording studio; a mixing desk; a microphone in a '
                                               'vocal booth'),
    'vinyl': ('Music', 'records', 'vinyl records; a record player turntable; an album cover'),
    'camera': ('Photos', 'photography', 'a camera; a camera lens; photography gear'),
    'fashion': ('Fashion', None, 'a fashion photo of an outfit; clothes on a rail; a model wearing designer '
                                 'clothes; sneakers'),
    'makeup': ('Beauty', None, 'makeup and cosmetics; nail art; a skincare product'),
    'books': ('Books', None, 'a stack of books; a bookshelf; a book cover; someone reading a book'),
    'film': ('Film', None, 'a still from a movie; a cinema screen; a movie poster'),
    'video game': ('Games', None, 'a video game; a game controller; a board game'),
    'code': ('Code', None, 'computer code on a screen; a code editor; a terminal window'),
    'laptop': ('Work', None, 'an office desk with a laptop; a meeting in an office; a home office'),
    'whiteboard': ('School', None, 'a whiteboard with notes; a classroom; lecture slides'),
    'science': ('Science', None, 'a science laboratory; a microscope; a chemistry experiment'),
    'medical': ('Health', 'medical', 'a hospital; an x-ray; medicine and pills'),
    'money': ('Money', None, 'cash and coins; a credit card; a bank statement'),
    'product': ('Shopping', None, 'a product photo on a white background; an item for sale'),
    'tattoo': ('Art', None, 'a tattoo; a tattoo design'),
}


# ---------------------------------------------------------------- what kind of document
# name: (topic, concept, role, 'clues', 'telltales'). Clues are phrases
# (regular expressions, matched on lower-case text); a document needs two
# clues, or one telltale (a phrase that settles it alone, usually in a title).
DOC_TYPES = {
    'invoice': ('Money', 'freelance', 'keeping',
                r'invoice|bill to|amount due|total due|payment terms|due date|vat no|vat number|unit price|'
                r'qty|sort code|bank details|remittance',
                r'^invoice\b|\binvoice (?:no|number|#)|\binvoice \d'),
    'receipt': ('Shopping', None, 'keeping',
                r'receipt|subtotal|sub-total|order (?:number|no)|order confirmation|thank you for your (?:order|'
                r'purchase)|paid with|card ending|cashier|till|change due|items?:',
                r'^receipt\b|\breceipt (?:no|number|#)|order confirmation'),
    'bank statement': ('Money', 'budgeting', 'keeping',
                       r'statement|opening balance|closing balance|balance brought forward|account number|'
                       r'sort code|iban|direct debit|standing order|money in|money out|transactions',
                       r'bank statement|statement of account'),
    'payslip': ('Work', 'day job', 'keeping',
                r'payslip|pay slip|net pay|gross pay|tax code|national insurance|ni number|deductions|'
                r'pay period|employee (?:no|number|id)|year to date|ytd',
                r'payslip|pay slip|pay stub|earnings statement'),
    'tax': ('Money', 'tax', 'keeping',
            r'tax return|self assessment|hmrc|irs|p60|p45|p11d|w-2|1099|utr|tax year|taxable|allowance|'
            r'tax due|refund',
            r'tax return|self assessment|\bp60\b|\bw-2\b|form 1040'),
    'bill': ('Home', None, 'keeping',
             r'electricity|gas|water|energy|meter reading|kwh|tariff|council tax|broadband|account number|'
             r'direct debit|amount due|billing period|standing charge',
             r'energy bill|council tax bill|water bill|phone bill|your bill'),
    'insurance': ('Money', None, 'keeping',
                  r'policy (?:number|no)|insurance|insured|premium|excess|cover|claims?|renewal|no claims|'
                  r'schedule of cover|policyholder',
                  r'insurance (?:policy|certificate|schedule|renewal)|certificate of insurance'),
    'contract': ('Work', None, 'keeping',
                 r'agreement|contract|hereby|the parties|terms and conditions|whereas|in witness|signed|'
                 r'signature|clause|obligations|termination|governing law|effective date',
                 r'^(?:\w+ )?(?:contract|agreement)\b|non-disclosure|terms of engagement'),
    'tenancy': ('Home', 'renting', 'keeping',
                r'tenancy|tenant|landlord|deposit|rent|letting|the property|inventory|notice to quit|'
                r'periodic|guarantor',
                r'tenancy agreement|lease agreement|rental agreement|assured shorthold'),
    'cv': ('Work', 'career', 'making',
           r'curriculum vitae|\bresume\b|\bcv\b|work experience|experience|education|skills|references|'
           r'employment history|profile|achievements|linkedin',
           r'curriculum vitae|^cv\b|\bcv$|^resume\b|\bresume$|résumé'),
    'cover letter': ('Work', 'career', 'making',
                     r'dear hiring manager|i am writing to apply|the role of|the position of|'
                     r'my experience|i would welcome|look forward to hearing',
                     r'cover letter|covering letter'),
    'letter': (None, None, None,
               r'^dear |yours sincerely|yours faithfully|kind regards|best regards|warm regards|'
               r'with love|love from',
               r'^dear [a-z]'),
    'boarding pass': ('Travel', 'trip planning', 'planning',
                      r'boarding|gate|seat|flight|departure|arrival|terminal|passenger|e-ticket|'
                      r'booking reference|check-in|baggage|carrier',
                      r'boarding pass|e-ticket|eticket'),
    'booking': ('Travel', 'trip planning', 'planning',
                r'booking|reservation|confirmation|check-in|check-out|guests?|nights?|hotel|airbnb|'
                r'itinerary|booking reference|confirmation number|cancellation',
                r'booking confirmation|reservation confirmation|your booking|your reservation|itinerary'),
    'ticket': ('Events', None, 'planning',
               r'ticket|admit|doors|venue|row|seat|entry|event|show|performance|e-ticket|barcode',
               r'^tickets?\b|your tickets?|e-ticket'),
    'menu': ('Recipes', 'restaurants', None,
             r'menu|starters|mains|desserts|sides|small plates|wine list|set menu|tasting menu|£\d',
             r'^menu\b|\bmenu$|tasting menu'),
    'manual': ('Home', None, 'keeping',
               r'manual|instructions|installation|warranty|safety|troubleshooting|specifications|'
               r'model number|getting started|operating',
               r'user manual|user guide|owner\'?s manual|instruction manual|quick start guide'),
    'medical': ('Health', 'medical', 'keeping',
                r'patient|nhs number|diagnosis|prescription|dosage|clinic|consultant|referral|'
                r'blood test|results|appointment|gp|hospital|discharge',
                r'discharge summary|prescription|test results|vaccination record|medical report'),
    'school report': ('Family', 'kids', 'keeping',
                      r'pupil|student|attainment|progress|effort|attendance|teacher|term|reading|'
                      r'phonics|year \d|class teacher|headteacher',
                      r'school report|end of term report|progress report'),
    'certificate': (None, None, 'keeping',
                    r'certificate|certify|certifies|awarded|completion|achievement|presented to|'
                    r'has successfully|issued',
                    r'^certificate\b|certificate of (?:completion|achievement|attendance)|diploma'),
    'paper': ('Science', None, 'learning',
              r'abstract|introduction|method|methods|methodology|results|discussion|conclusion|'
              r'references|et al|doi|journal|participants|hypothesis|literature',
              r'^abstract\b|\bdoi:|arxiv'),
    'lecture': ('School', None, 'learning',
                r'lecture|seminar|module|week \d|syllabus|reading list|assignment|exam|learning outcomes|'
                r'tutorial|coursework',
                r'^lecture \d|lecture notes|syllabus|module handbook'),
    'script': ('Writing', None, 'making',
               r'\bint\.|\bext\.|fade in|fade out|cut to|\(v\.o\.\)|\(o\.s\.\)|continuous',
               r'fade in:|^int\. |^ext\. '),
    'form': (None, None, 'keeping',
             r'please complete|please tick|date of birth|signature|office use only|block capitals|'
             r'applicant|declaration|form',
             r'application form|registration form|consent form'),
}


# ---------------------------------------------------------------- cookbooks

# A cookbook's chapters, in the order its dividers stand in the box, with the
# words that put a recipe there (its title counts most; joined words like
# ice_cream are phrases). The last is where anything else goes.
RECIPE_CHAPTERS = (
    ('Breakfast', 'breakfast brunch pancake pancakes waffle waffles granola porridge oats oatmeal overnight omelette '
                  'omelet frittata shakshuka eggs benedict scrambled french_toast muesli crumpet crumpets bagel '
                  'smoothie_bowl hash_browns'),
    ('Starters & snacks', 'starter starters snack snacks appetiser appetizer appetizers canape canapes dip dips '
                          'hummus houmous guacamole bruschetta crostini nachos crackers dumpling dumplings gyoza '
                          'spring_rolls samosa samosas pakora fritters arancini croquettes tapas mezze bites wings'),
    ('Soups & salads', 'soup soups salad salads broth chowder bisque gazpacho minestrone slaw coleslaw tabbouleh '
                       'panzanella caesar nicoise dal dhal'),
    ('Mains', 'chicken beef pork lamb steak mince sausage sausages fish salmon cod tuna prawns prawn shrimp tofu '
              'tempeh pasta spaghetti lasagne lasagna linguine penne rigatoni noodles ramen curry stew casserole '
              'risotto paella tacos burrito burritos enchiladas burger burgers pizza pie stir_fry stirfry roast '
              'traybake bake chilli chili bolognese ragu meatballs kebab kebabs pad_thai biryani tagine schnitzel '
              'dinner supper main'),
    ('Sides', 'side sides potatoes potato mash mashed fries chips wedges gratin rice pilaf greens beans '
              'roasted_vegetables veg carrots sprouts cauliflower broccoli corn polenta couscous flatbread'),
    ('Sauces & basics', 'sauce sauces dressing vinaigrette stock gravy pesto salsa chutney jam relish pickle '
                        'pickles pickled mayo mayonnaise aioli marinade rub spice_blend butter ketchup syrup '
                        'curd compote'),
    ('Baking', 'bread loaf loaves sourdough focaccia baguette rolls buns brioche bagels muffin muffins scone '
               'scones cookie cookies biscuit biscuits brownie brownies blondies cake cakes cupcake cupcakes '
               'banana_bread traybake flapjack flapjacks shortbread croissant croissants pastry danish cinnamon '
               'rolls pretzel pretzels dough yeast'),
    ('Desserts', 'dessert desserts pudding puddings ice_cream gelato sorbet mousse tart tarts crumble cobbler '
                 'custard panna_cotta tiramisu cheesecake trifle pavlova meringue souffle fudge truffles '
                 'brulee creme_caramel sundae parfait'),
    ('Drinks', 'drink drinks cocktail cocktails mocktail smoothie smoothies lemonade juice coffee latte tea chai '
               'margarita negroni martini spritz punch sangria milkshake shake cordial kombucha hot_chocolate'),
    ('Everything else', ''),
)

# Sites whose pages are recipes (a saved link from one gets a card).
RECIPE_SITES = (
    'allrecipes.com bbcgoodfood.com cooking.nytimes.com seriouseats.com bonappetit.com epicurious.com '
    'foodnetwork.com foodnetwork.co.uk smittenkitchen.com budgetbytes.com delish.com tasty.co food52.com '
    'jamieoliver.com simplyrecipes.com kingarthurbaking.com thekitchn.com minimalistbaker.com recipetineats.com '
    'halfbakedharvest.com cookieandkate.com loveandlemons.com sallysbakingaddiction.com taste.com.au '
    'ottolenghi.co.uk nigella.com marthastewart.com eatingwell.com myrecipes.com olivemagazine.com '
    'deliciousmagazine.co.uk bbc.co.uk/food thewoksoflife.com justonecookbook.com maangchi.com '
    'pinchofyum.com damndelicious.net skinnytaste.com hellofresh.com gousto.co.uk tasteofhome.com '
    'food.com yummly.com bettycrocker.com joyofbaking.com davidlebovitz.com hebbarskitchen.com '
    'indianhealthyrecipes.com woolworths.com.au/shop/recipes sainsburysmagazine.co.uk waitrose.com/ecom/recipes'
).split()

# Planet names that say it's for food: the cookbook offer reads these. Phrases
# use underscores. Emoji count too.
RECIPE_NAMES = (
    'recipe recipes recipies receipes recipe_box cookbook cook_book cookbooks cooking cookin cook cooks to_cook '
    'baking bakes bakery bake to_bake bread breads sourdough cakes cake cookies treats sweets pastry '
    'kitchen food foods foodie eats eat yum yummy nom noms grub chow munchies snacks snack '
    'meal meals mealprep meal_prep meal_plan meal_ideas dinner dinners dinner_ideas supper suppers lunch lunches '
    'breakfast breakfasts brunch dessert desserts pudding puddings dishes cuisine chef menu menus '
    'cocktails cocktail drinks mocktails smoothies soups soup salads salad pasta noodles curries curry '
    'vegan vegetarian veggie plant_based keto paleo bbq barbecue grill grilling slow_cooker air_fryer airfryer '
    'family_recipes grandmas_recipes nans_recipes mums_recipes moms_recipes cocina cucina cuisine'
).split()
RECIPE_EMOJI = '🍳🥘🍲🍝🍜🍛🍕🍔🌮🌯🥗🥪🍞🥐🥖🥯🧁🍰🎂🍪🥧🍩🍫🍮🍦🍨🍧🥞🧇🍱🍣🍤🥟🍙🍚🫕🥙🧆🍹🍸🍷🍺☕🍵🧑‍🍳👩‍🍳👨‍🍳🔪🥄🍴🍽️🥕🍅🥑🧄🧅🌶️🫑🍋🍓🫐'

# Foods and dishes, for telling a note that names a meal ("fish w/couscous",
# "portabello and chickpea") from any other short note. Singular forms; a
# plural "s" is understood. DISHES are words that name a whole meal on their
# own ("lasagne"), so one of them is enough; a lone FOOD ("eggs") isn't.
FOODS = (
    'beef pork lamb chicken turkey duck mince steak sausage sausages bacon ham chorizo salami prosciutto pancetta '
    'meatball meatballs fish salmon tuna cod haddock trout mackerel sardine anchovy prawn prawns shrimp crab '
    'lobster mussel mussels clam squid calamari scallop tofu tempeh seitan halloumi paneer feta mozzarella '
    'cheddar parmesan ricotta brie camembert goat_cheese cheese cream butter yogurt yoghurt milk egg '
    'potato potatoes sweet_potato onion garlic leek shallot pepper peppers chilli chili jalapeno tomato tomatoes '
    'mushroom portobello portabello portabella shiitake carrot celery courgette zucchini aubergine eggplant '
    'broccoli cauliflower cabbage kale spinach chard lettuce rocket arugula cucumber beetroot beet squash '
    'pumpkin butternut corn sweetcorn pea peas bean beans green_beans chickpea lentil lentils edamame '
    'avocado olive olives artichoke asparagus fennel radish parsnip turnip okra bok_choy pak_choi '
    'rice couscous quinoa bulgur barley farro polenta oats noodle noodles pasta spaghetti penne fusilli '
    'macaroni linguine tagliatelle orzo gnocchi bread toast baguette pita pitta naan tortilla tortillas '
    'wrap crackers cracker crisps chips fries bagel croissant flatbread dumpling dumplings '
    'apple banana lemon lime orange berries strawberry blueberry raspberry mango pineapple peach pear '
    'plum cherry grape grapes date dates fig coconut nuts almond almonds walnut peanut cashew pistachio '
    'tahini miso kimchi harissa curry_paste '
    'chocolate honey jam caramel custard maple'
).split()
DISHES = (
    'curry stew soup salad pasta risotto lasagne lasagna bolognese carbonara pie quiche tart pizza '
    'burger burgers sandwich sandwiches taco tacos burrito burritos enchilada enchiladas quesadilla fajitas '
    'nachos chili chilli stirfry stir_fry stir_fried fried_rice ramen pho pad_thai laksa noodle_soup '
    'dal daal dhal tagine casserole bake traybake tray_bake roast hotpot hash goulash paella gumbo '
    'jambalaya chowder broth omelette omelet frittata shakshuka pancakes waffles porridge granola '
    'smoothie crumble cake cookies brownies muffins scones flapjacks cheesecake pudding mousse trifle '
    'dumplings gyoza sushi poke bibimbap katsu teriyaki kebab kebabs souvlaki gyros falafel shawarma '
    'meatloaf pot_pie mac_and_cheese mash slop skillet bowl buddha_bowl tikka korma masala biryani '
    'jalfrezi vindaloo rendang satay schnitzel stroganoff ragu cacciatore gratin moussaka ratatouille '
    'minestrone gazpacho chili_con_carne cottage_pie shepherds_pie fish_and_chips bangers toastie '
    'wraps sliders kofta lentil_soup hummus pesto salsa guacamole gravy chutney dip coleslaw slaw spag_bol spaghetti_bolognese beans_on_toast'
).split()

# Notes with these names are lists of food, not recipes.
NOT_RECIPE_NAMES = (
    'shopping groceries grocery to_buy shopping_list pantry_list restaurants places_to_eat reservations '
    'menu_plan meal_plan food_diary food_log what_i_ate calories macros'
).split()

# Cooking verbs: a note that does several of these to food is telling you how to make it.
COOK_VERBS = (
    'preheat bake baked fry fried simmer boil roast roasted stir whisk knead chop chopped mix saute sauté '
    'grill grilled toss fold season marinate blend melt dice diced slice sliced mince minced grate grated '
    'braise poach sear brown drain reduce caramelise caramelize steam blanch puree rest proof prove'
).split()

# Video and picture sites where links are often recipes, on a planet that's about food.
FOOD_VIDEO_SITES = 'youtube.com youtu.be tiktok.com instagram.com pinterest.com pin.it vimeo.com reddit.com'.split()
