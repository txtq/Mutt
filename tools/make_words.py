"""Build the spellchecker's word list, public/assets/words/en.txt.

Only needed to change the list. It downloads (into a folder you name):
  - SCOWL word lists, sizes 10–60, English + American + British + Canadian
    spellings, from the npm package wordlist-english@1.2.1 (Kevin Atkinson's
    SCOWL; see public/assets/words/README),
  - a word-frequency list (hermitdave/FrequencyWords, en_50k, CC BY-SA 4.0),
    used only to put the words in order of how common they are.

The file is one word per line, most common first, so a word's line number is
its rank. Contractions and a few everyday words SCOWL leaves out are added.

    python3 tools/make_words.py /tmp/words
"""
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'assets', 'words', 'en.txt')
SCOWL = 'https://cdn.jsdelivr.net/npm/wordlist-english@1.2.1/{}-words-{}.json'
FREQ = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt'
SIZES = (10, 20, 35, 40, 50, 55, 60)
SPELLINGS = ('english', 'american', 'british', 'canadian')

CONTRACTIONS = """
I'm I've I'll I'd you're you've you'll you'd he's he'll he'd she's she'll she'd
it's it'll it'd we're we've we'll we'd they're they've they'll they'd
that's that'll that'd there's there'll there'd here's what's what'll what'd
who's who'll who'd where's when's why's how's let's
isn't aren't wasn't weren't don't doesn't didn't haven't hasn't hadn't
won't wouldn't can't couldn't shouldn't mustn't needn't mightn't shan't ain't
could've would've should've might've must've y'all o'clock ma'am
"""

# Everyday words SCOWL leaves out (or keeps only in its bigger lists).
EXTRA = """
ok okay app apps wifi url urls email emails emailed emailing online offline
website websites webpage login logins logout signup username usernames
password passwords smartphone smartphones iphone ipad ios macos android
youtube instagram tiktok facebook twitter whatsapp spotify netflix google
googled googling texting podcast podcasts livestream vlog vlogs blog blogs
emoji emojis selfie selfies hashtag hashtags meme memes playlist playlists
screenshot screenshots unfollow lol omg btw fyi diy pdf pdfs jpeg png gif
epub epubs ebook ebooks wiki wikipedia covid lockdown hoodie hoodies
smoothie smoothies granola quinoa kombucha matcha sriracha tahini hummus
falafel ramen pho sushi tofu tempeh kimchi gochujang miso edamame burrata
focaccia ciabatta brioche sourdough babka shakshuka dal paneer naan
skincare haircut workout workouts bestie vibe vibes
"""


def fetch(url, path):
    if not os.path.exists(path):
        with urllib.request.urlopen(url) as r, open(path, 'wb') as f:
            f.write(r.read())
    return path


def main(folder):
    os.makedirs(folder, exist_ok=True)
    tier = {}
    for size in SIZES:
        for spelling in SPELLINGS:
            path = fetch(SCOWL.format(spelling, size), os.path.join(folder, f'{spelling}-{size}.json'))
            with open(path) as f:
                for w in json.load(f):
                    tier.setdefault(w, size)
    for w in EXTRA.split():
        tier.setdefault(w, 35)
    for w in CONTRACTIONS.split():
        tier.setdefault(w, 10)

    rank = {}
    with open(fetch(FREQ, os.path.join(folder, 'en_50k.txt'))) as f:
        for n, line in enumerate(f):
            word = line.split(' ', 1)[0]
            rank.setdefault(word, n)

    contractions = set(CONTRACTIONS.split())

    def order(w):
        if w in contractions:       # common, but the frequency list splits them at the apostrophe
            return (0, 150, w)
        r = rank.get(w.lower())
        return (0, r, w) if r is not None else (1, tier[w], w)

    words = sorted(tier, key=order)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        f.write('\n'.join(words) + '\n')
    print(f'{len(words)} words → {os.path.relpath(OUT)}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '/tmp/mutt-words')
