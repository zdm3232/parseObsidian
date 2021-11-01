
var fs = require('fs').promises;
var fso = require('fs');
var readline = require('readline');

var packs = {};

/*
  External interface
*/
module.exports = {
  // cleans up object name of some special characters
  createId: function( name ) {
    return cleanIdName( name );
  },
  // return foundry link for a reference
  linkAref: function( href, text ) {
    return convertAref( href, text );
  },
  // read compendium packs to create links to
  readPacks: async function() {
    let packDir = "/home/zim/foundaryZ/packs";
    packs.rules = await readJSON( packDir + "/rules.db" );
    packs.spells = await readJSON( packDir + "/spells.db" );
    packs.monsters = await readJSON( packDir + "/monsters.db" );
    packs.equipment = await readJSON( packDir + "/equipment.db" );
    packs.magicitems = await readJSON( packDir + "/magicitems.db" );
  }
};
  
/*
  Read foundry pack JSON
  Note that this is line by line valid JSON
  Put information into a map using flags.zdnd.id as key

  CHANGE: need key for link, for example
    https://www.dndbeyond.com/monsters/goblin
    Need to get the key of "goblin" somehow from the json data.
    My system uses the flags.zdnd.id
*/
async function readJSON( filename )
{
  console.warn( `Read pack ${filename}` );

  try {
    await fs.access( `${filename}` );
  } catch {
    console.error( `  Could not read pack ${filename}` );
    return false;
  }

  var map = new Map();
  const rl = readline.createInterface( {
    input: fso.createReadStream( filename )
  });
  for await (const line of rl) {
    var result = await JSON.parse( line );
    map.set( result.flags.zdnd.id, result );
  }
  
  console.warn( `  ${map.size} items` );
  return map;
}

/*
  Look up compendium id from the packs based on type and id
*/
function findId( type, name )
{
  let id = undefined;
  if ( packs[type] ) {
    let v = packs[type].get( name );
    if ( v ) { id = v._id };
  }
  return id;
}

/*
  Clean up some special characters
*/
function cleanIdName( name ) {
  name = name.toLowerCase();
  name = name.replace( /\./g, "" );
  name = name.replace( /(\d+),(\d+)/, "$1-$2" );
  name = name.replace( /[’\'\+\(\)\,]/g, "" ).replace( /\s+/g, "-" );
  return name;
}

/*
  Create foundry link for a dndbeyond web link

  CHANGE:
    Need to change the compendium name and possibly types for your system.  Mine are all zdnd.type.
    Also, the key described above comes from the link.
    I have a compendium for each type (monsters, equipment, magicitems, spells, etc.)
    so it is simple for me to just match the type from the dndbeyond link to my compendium
*/
function convertAref( href, text )
{
  // links for rules as parsing is slightly different than other objects
  let matches = href.match( /\/rules\/.*#(\S+)$/ );
  if ( matches ) {
    let id = cleanIdName( matches[1] );
    let result = findId( "rules", id );
    if ( result === undefined ) {
      return null;
    }
    let newvalue = `@Compendium[zdnd.rules.${result}]{${text}}`;
    return newvalue;
  }

  // links for spells/monsters/equipment/magicitems
  // regexp will assume at end of link is <type>/<id>
  matches = href.match( /\/([^\/]+)\/([^\/]+)$/ );
  if ( matches ) {
    // remove - from magic-items to match my compendiums
    let type = matches[1].replace( /-/, "" );
    let id = cleanIdName( matches[2] );
    let result = findId( type, id );
    if ( result === undefined ) {
      return null;
    }
    var newvalue =`@Compendium[zdnd.${type}.${result}]{${text}}`;
    return newvalue;
  }

  return null;
}
