# parseObsidian
parse obsidian into foundryVTT journal entries

### This requires other packages:

- readline    : streamed parsing
- path        : path string utilities
- sharp       : image processing for webp convert
- markdown-it : markdown parsing

You will need to use npm to install these modules.

Usage: parseObsidian.js "path to vault directory"

Parses every file at the top level of the vault directory and all files which are links underneath it.  Expects links to be full path to find them.  Does not currently support linking to markdown files outside this directory, although no technical reason not to do it.

Creates a directory of the same name in the current directory with the output.

Output will consist of
- folders.json : json to create folders in foundry
- adv.json     : json to create journals in foundry
- images       : directory of images converted to webp

The json assumes images paths on the foundry server of Data/imports/<vaultDirName>.
This could be changes with the serverDir variable at the top of the file.

For linking to compendiums to work, the linkPacks.js needs changed to match your system as it will be different from mine.  Look for CHANGE in the comments.

To import add module from
   https://github.com/zdm3232/zimport
under the servers module directory


       

