"""Builds "Send to Mutt", the Apple shortcut the account sheet's Share menu page hands out.

    python3 tools/make_shortcut.py [address [out]]

It writes public/assets/send-to-mutt.shortcut, signed with `shortcuts sign --mode anyone`
(only a Mac signed in to iCloud can sign; anyone can then add it). When added, the shortcut
asks for Mutt's address (`address`, the live site unless given) and the key made on that
page. In the Share menu (iPhone, iPad, Mac) and as a Quick Action in Finder, it sends each
file to POST /api/send and shows what Mutt said ("… is on Recipes.").
"""
import os
import plistlib
import subprocess
import sys
import tempfile
import uuid

LIVE = 'https://p01--mutt--cxklgp67kgsx.code.run'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'assets', 'send-to-mutt.shortcut')
SLOT = '￼'  # where a variable sits inside a line of text


def words(text, *parts):
    """A line of text with variables in it: `parts` fill the SLOTs in order."""
    spots, at = {}, 0
    for part in parts:
        at = text.index(SLOT, at)
        spots[f'{{{at}, 1}}'] = part
        at += 1
    return {'Value': {'string': text, 'attachmentsByRange': spots}, 'WFSerializationType': 'WFTextTokenString'}


def plain(text):
    return words(text)


def var(name, prop=None):
    found = {'Type': 'Variable', 'VariableName': name}
    if prop:
        found['Aggrandizements'] = [{'Type': 'WFPropertyVariableAggrandizement', 'PropertyName': prop}]
    return found


def output(of, name):
    return {'Type': 'ActionOutput', 'OutputUUID': of, 'OutputName': name}


def given(thing):
    return {'Value': thing, 'WFSerializationType': 'WFTextTokenAttachment'}


def action(ident, **params):
    return {'WFWorkflowActionIdentifier': f'is.workflow.actions.{ident}', 'WFWorkflowActionParameters': params}


def header(key, value):
    return {'WFItemType': 0, 'WFKey': plain(key), 'WFValue': value}


def build(address):
    loop, sent, said, ended, place, key = (str(uuid.uuid4()).upper() for _ in range(6))
    actions = [
        action('gettext', UUID=place, WFTextActionText=address),                        # 0: asked when added
        action('setvariable', WFVariableName='Mutt', WFInput=given(output(place, 'Text'))),
        action('gettext', UUID=key, WFTextActionText=''),                               # 2: asked when added
        action('setvariable', WFVariableName='Key', WFInput=given(output(key, 'Text'))),
        action('repeat.each', WFInput=given({'Type': 'ExtensionInput'}),
               GroupingIdentifier=loop, WFControlFlowMode=0),
        action('downloadurl', UUID=sent,
               WFURL=words(f'{SLOT}/api/send', var('Mutt')),
               WFHTTPMethod='POST', ShowHeaders=True,
               WFHTTPHeaders={'Value': {'WFDictionaryFieldValueItems': [
                   header('Authorization', words(f'Bearer {SLOT}', var('Key'))),
                   header('X-Mutt', plain('1')),
                   header('X-Mutt-Name', words(SLOT, var('Repeat Item', 'Name'))),
                   header('X-Mutt-Ext', words(SLOT, var('Repeat Item', 'File Extension'))),
               ]}, 'WFSerializationType': 'WFDictionaryFieldValue'},
               WFHTTPBodyType='File',
               WFRequestVariable=given(var('Repeat Item'))),
        action('getvalueforkey', UUID=said, WFDictionaryKey='said',
               WFInput=given(output(sent, 'Contents of URL'))),
        action('repeat.each', UUID=ended, GroupingIdentifier=loop, WFControlFlowMode=2),
        action('notification', WFNotificationActionTitle='Mutt',
               WFNotificationActionBody=words(SLOT, output(ended, 'Repeat Results'))),
    ]
    return {
        'WFWorkflowClientVersion': '2302.0.4',
        'WFWorkflowMinimumClientVersion': 900,
        'WFWorkflowMinimumClientVersionString': '900',
        'WFWorkflowIcon': {'WFWorkflowIconStartColor': 4282601983, 'WFWorkflowIconGlyphNumber': 59446},
        'WFWorkflowTypes': ['ActionExtension', 'QuickActions'],
        'WFQuickActionSurfaces': [],
        'WFWorkflowHasShortcutInputVariables': True,
        'WFWorkflowInputContentItemClasses': [
            'WFGenericFileContentItem', 'WFImageContentItem', 'WFPDFContentItem',
            'WFAVAssetContentItem', 'WFPhotoMediaContentItem',
        ],
        'WFWorkflowOutputContentItemClasses': [],
        'WFWorkflowImportQuestions': [
            {'ActionIndex': 0, 'Category': 'Parameter', 'ParameterKey': 'WFTextActionText',
             'Text': 'Mutt’s address (leave it as it is unless you run your own Mutt).', 'DefaultValue': address},
            {'ActionIndex': 2, 'Category': 'Parameter', 'ParameterKey': 'WFTextActionText',
             'Text': 'Paste your key from Mutt (your account, Share menu, Set up).', 'DefaultValue': ''},
        ],
        'WFWorkflowActions': actions,
    }


def main():
    address = (sys.argv[1] if len(sys.argv) > 1 else LIVE).rstrip('/')
    out = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else OUT)  # a test copy goes elsewhere
    with tempfile.TemporaryDirectory() as tmp:
        raw = os.path.join(tmp, 'Send to Mutt.shortcut')
        with open(raw, 'wb') as f:
            plistlib.dump(build(address), f, fmt=plistlib.FMT_BINARY)
        if os.path.exists(out):
            os.remove(out)  # `shortcuts sign` won't write over a file
        subprocess.run(['shortcuts', 'sign', '--mode', 'anyone', '--input', raw, '--output', out],
                       check=True)
    print('wrote', out)


if __name__ == '__main__':
    main()
