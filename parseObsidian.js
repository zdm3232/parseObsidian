#!/usr/bin/node

var markDown = require('markdown-it')();
var fs = require('fs').promises;
var fso = require('fs');
var path = require('path');
var sharp = require('sharp');

// CHANGE: you will need custom linkPacks (could just change this line to require yours)
var links = require('./linkPacks.js');

var serverDir = "imports";
var advTitle = null;
var advDir = null;
var packs = {};
var renderDB = null;
var renderChildren = null;
var myDBs = {};
var linkCheck = {};
var myImages = [];



// debug
function view( obj )
{
  console.log( JSON.stringify( obj, null, 2 ) );
}

// deep copy instead of reference
function deepCopy( obj )
{
  return JSON.parse( JSON.stringify( obj ) );
}

// test if file already exists (generally done for downloads to not do again)
async function fileExists( filename ) {
  try {
    await fs.access( `${filename}` );
  } catch {
    return false;
  }
  return true;
}

// download a file (typically images)
async function downloadFile( url, filename ) {
  try {
    const response = await fetch( url );
    return new Promise( resolve => {
      let out = fso.createWriteStream( filename );
      response.body.pipe( out );
      out.on('finish', resolve);
    });
  } catch (error) {
    console.error( `FAILED to download ${url}` );
    console.error( error );
  }
}

// convert image to webp
async function convertWebp( image, output )
{
  console.log( `   convert: image ${output}` );
  await sharp( image )
    .toFormat( 'webp' )
    .toFile( output );
}

// given array of images download (or copy from vault) images and convert to webp
// all of them are placed in the advTitle/images directory
async function downloadImages()
{
  if ( !await fileExists( `${advTitle}/images` ) ) {
    await fs.mkdir( `${advTitle}/images` );
  }

  let imgPath = `${advTitle}/images`;
  for ( let image of myImages ) {
    if ( !await fileExists( `${imgPath}/${image.img}` ) ) {
      console.log( `  download: image ${image.base}` );
      if ( image.url.match( /^http/ ) ) {
	await downloadFile( image.url, `${imgPath}/${image.base}` );
	await convertWebp( `${imgPath}/${image.base}`, `${imgPath}/${image.img}` );
      } else {
	// simply copy
	let fname = findFullPath( image.url );
	await fs.copyFile( fname, `${imgPath}/${image.base}` );
	await convertWebp( `${imgPath}/${image.base}`, `${imgPath}/${image.img}` );
      }
    }
  }
}

// determine full path from inputDir
function findFullPath( filename )
{
  // determine the full path from the advDir
  // expected that all links are directories below the rootDir
  let fullFileName = filename;
  let firstDirMatch = filename.match( /^[^\/]+/ );
  if ( firstDirMatch && firstDirMatch.length > 0 ) {
    let path = advDir.split( firstDirMatch[0] )[0];
    fullFileName = `${path}${filename}`;
  }
  return fullFileName;
}

// determine folder under root in the vault
function findFolder( filename )
{
  // determine the folder from root
  // expected that all links are directories below the rootDir
  let root = advDir.replace( /\/[^\/]+$/, "" );
  let re = new RegExp( `${root}\/` );
  let folder = "zid-" + filename.replace( re, "" ).replace( /\/[^\/]+$/, "" );
  return folder;
}

// parse image from a link and change name to match server
// on serverDir is specifying path under foundry Data folder to find the advTitle
function readImage( db, url )
{
  let base = path.basename( url ).replace( /(\[|\])/g, "" );
  let img = base;
  img = img.replace( /\.[^\.]+$/, ".webp" );
  if ( img.match( /\?/ ) ) {
    img = img.replace( /\?.*$/, ".webp" );
  }
  let src = `${serverDir}/${advTitle}/images/${img}`;
  if ( db.img === null ) {
    db.img = src;
  }
  myImages.push( { url: url, base: base, img: img } );
  return `<img src="${src}" />`;
}

// write folders.json
async function writeFolders( dbs )
{
  let folders = {};
  for ( let db of dbs ) {
    if ( folders[ db.flags.zdnd.folder ] === undefined ) {
      let id = db.flags.zdnd.folder;
      let name = id.replace( /zid-/, "" );
      let parent = null;

      let matches = id.match( /\//g );
      if ( matches ) {
	if ( matches.length > 2 ) {
	  console.error( `ERROR: folder depth too large ${id}` );
	  process.exit();
	}
	parent = id.replace( /\/[^\/]+$/, "" );
	let paths = id.split( /\// );
	name = paths[ paths.length-1 ];
      }
      folders[ id ] = {
	id: id,
	parent: parent,
	name: name
      }
    }
  }

  let db = [];
  for ( let [key, folder] of Object.entries( folders ) ) {
    db.push( {
      parent: null,
      type: "JournalEntry",
      flags: {
	zdnd: {
	  id: folder.id,
	  pid: folder.parent
	}
      },
      name: folder.name
    });
  }

  await fs.writeFile( `${advTitle}/folders.json`, JSON.stringify( db ) );
}

// create backlinks
// list of backlinks are created at beginning of the content so will see across top of journal
async function createBackLinks( myDBs )
{
  for ( let [name, data] of Object.entries( myDBs ) ) {
    if ( data.backlinks.length === 0 ) {
      continue;
    }
    let backlinks = "<p>";
    backlinks += `<span class="zlink">@JournalEntry[zid=${advTitle}__toc]{TOC}</span>`
    for ( let link in data.backlinks ) {
      let parent = myDBs[link];
      backlinks += `<span class="zlink">@JournalEntry[zid=${link}]{${parent.name}}</span>`
    }
    backlinks += "</p>\n";
    data.content = `${backlinks}${data.content}`;
  }
}

// recursive TOC
async function addTOC( toc, db, level )
{
  let margin = 20 * level;
  toc.content += `<div class="zlink" style="margin-left: ${margin}px">@JournalEntry[zid=${db.flags.zdnd.id}]{${db.name}}</div>`
  for ( let child of db.children ) {
    let childDB = myDBs[ child.id ];
    await addTOC( toc, childDB, level+1 );
  }
}

// create TOC
// This is created for each top level markdown file in the directory
async function createTOC( rootDBs )
{
  let db = {};
  db.name = "Table of Contents";
  db.folder = null;
  db.flags = {
    zdnd: {
      id: `${advTitle}__toc`,
      folder: `zid-${advTitle}`,
      toc: null,
      parent: null,
      level: 1
    }
  };
  db.content = "";
  db.img = null;
  for ( let root of rootDBs ) {
    await addTOC( db, root, 0 );
    db.content += "<p> </p><hr><p> </p>\n";
  }
  return db;
}

// convert link from markdown into image/journal entry
function linkReplace( link, topLevel )
{
  if ( link.match( /^\/r/ ) ) {
    return null;
  }

  // check for image
  if ( link.match( /\.(jpg|jpeg|png)\]\]$/ ) ) {
    return readImage( renderDB, link );
  }


  link = link.replace( /\[/g, "" ).replace( /\]/g, "" ).replace( /\\\//, "" );
  let mname = link.match( /^(.*)\|(.*)$/ );
  let name = link;
  let title = null;
  if ( mname ) {
    name = mname[1];
    title = mname[2];
  }
  let file = name + ".md";
  let mbase = name.match( /\/([^\/]+)$/ );
  if ( mbase ) {
    name = mbase[1];
  }
  if ( title == null ) {
    title = name;
  }
  let id = links.createId( name );

  if ( topLevel ) {
    renderChildren.push( { file: file, name: name, id: id, title: title } );
  }

  linkCheck[ id ] = true;
  let type = (topLevel) ? "div" : "span";
  return `<${type} class="zlink">@JournalEntry[zid=${id}]{${title}}</${type}>`
}

// add text rule
var defaultRenderText = markDown.renderer.rules.text;
markDown.renderer.rules.text = function( tokens, idx, options, env, self )
{
  let token = tokens[idx];
  if ( token.zimhref ) {
    return "";
  }

  let sound = token.content.match( /^@Sound\:([^\{]+)\{([^\}]+)\}/ );
  if ( sound ) {
    return `<p><a class="sound_link" data-file="${sound[1]}">${sound[2]}</a></p>`;
  }

  let matches = token.content.match( /\[\[[^\]]+\]\]/g );
  if ( matches ) {
    let topLevel = (idx==0 && tokens.length==1 && token.content.charAt(0)=='[' ) ? 1 : 0;
    let html = token.content;
    for ( let link of matches ) {
      let rep = linkReplace( link, topLevel );
      if ( rep ) {
	html = html.replace( link, rep );
	html = html.replace( /^\!/, "" );
      }
    }
    return html;
  }
  return defaultRenderText( tokens, idx, options, env, self );
};

// add image rule
var defaultRenderImage = markDown.renderer.rules.image;
markDown.renderer.rules.image = function( tokens, idx, options, env, self )
{
  let token = tokens[idx];
  if ( token.zimhref ) {
    return "";
  }
  let html = readImage( renderDB, token.attrs[0][1] );
  return html;
};

// add aref rule
var defaultRenderLinkOpen = markDown.renderer.rules.link_open || function(tokens, idx, options, env, self) { return self.renderToken(tokens, idx, options); };
markDown.renderer.rules.link_open = function( tokens, idx, options, env, self )
{
  let token = tokens[idx];
  let href = token.attrs[0][1];
  let value = tokens[idx+1].content;
  if ( href ) {
    let newValue = links.linkAref( href, value );
    if ( newValue ) {
      // mark tokens
      for ( let i = idx; i < tokens.length; i++ ) {
	tokens[i].zimhref = true;
	if ( tokens[i].type === 'link_close' ) {
	  break;
	}
      }
      return newValue;
    } else {
      console.log( `  MISSING: ${href}` );
    }
  }
  return defaultRenderLinkOpen( tokens, idx, options, env, self );
}

var defaultRenderLinkClose = markDown.renderer.rules.link_close || function(tokens, idx, options, env, self) { return self.renderToken(tokens, idx, options); };
markDown.renderer.rules.link_close = function( tokens, idx, options, env, self )
{
  let token = tokens[idx];
  if ( token.zimhref ) {
    return "";
  }
  return defaultRenderLinkClose( tokens, idx, options, env, self );
}

// parse markdown file
async function readMarkdownFile( filename, level, parent )
{
  let name = path.basename( filename ).replace( /\.md$/, "" );
  let id = links.createId( name );

  let prev = myDBs[ id ];
  if ( prev !== undefined ) {
    console.warn( `  Top level ${filename} alread read` );
    // assign parent if not already set
    if ( !prev.flags.zdnd.parent ) {
      prev.flags.zdnd.parent = parent;
    }
    return prev;
  }

  // determine folder
  let folder = findFolder( filename );

  let db = {};
  db.name = name;
  db.folder = null;
  db.flags = {
    zdnd: {
      id: id,
      folder: folder,
      toc: level>1 ? `${advTitle}__toc` : null,
      parent: parent,
      level: level
    }
  };
  db.backlinks = {};
  if ( parent ) {
    db.backlinks[ parent ] = 32;
  }
  db.img = null;

  console.warn( `Reading ${db.name}` );

  let data = await fs.readFile( `${filename}`, 'utf8' );
  renderDB = db;
  renderChildren = [];
  let html = await markDown.render( data );
  renderDB = null;
  db.children = [];
  for ( let child of renderChildren ) {
    let prev = myDBs[ child.id ];
    if ( prev !== undefined ) {
      // add backlink
      prev.backlinks[ id ] = 32;

      // assign parent if not already set
      if ( !prev.flags.zdnd.parent ) {
	prev.flags.zdnd.parent = parent;
      }
      continue;
    }
    db.children.push( { file: child.file, id: child.id, title: child.title } );
  }
  renderChildren = [];

  db.content = html;
  myDBs[ id ] = deepCopy( db );

  // console.log( html );

  // read children
  for ( let child of db.children ) {
    let childFileName = findFullPath( child.file );
    await readMarkdownFile( childFileName, level+1, id );
  }

  // console.warn( `  done reading ${db.name}` );
  return db;
}

(async () => {
  await links.readPacks();

  let dirname = null;
  for ( let i = 2; i < process.argv.length; i++ ) {
    if ( process.argv[i].match( /^-/ ) ) {
      continue;
    }
    dirname = process.argv[i];
    break;
  }
  if ( !dirname ) {
    console.error( 'ERROR: provide input directory' );
  }

  // remove ending slash if there
  dirname = dirname.replace( /\/$/, "" );
  advDir = dirname;
  advTitle = path.basename( dirname );

  console.warn( `Reading adventure ${advTitle}` );

  if ( !await fileExists( `${advTitle}` ) ) {
    await fs.mkdir( `${advTitle}` );
  }

  // parse all files
  myImages = [];
  let rootDBs = [];
  let files = await fs.readdir( dirname );
  for ( let filename of files ) {
    let stats = await fs.lstat( `${dirname}/${filename}` );
    if ( stats.isDirectory() ) {
      continue;
    }
    console.log( `Parse file ${dirname}/${filename}` );
    rootDBs.push( await readMarkdownFile( `${dirname}/${filename}`, 1, null ) );
  }

  await downloadImages();

  console.log( `Done reading ${rootDBs.length} top level files` );

  for ( let key of Object.keys(linkCheck) ) {
    if ( myDBs[key] === undefined ) {
      console.error( `ERROR: missing link ${key}` );
    }
  }

  let dbs = [];
  dbs.push( await createTOC( rootDBs ) );
  await createBackLinks( myDBs );

  for ( let key of Object.keys(myDBs) ) {
    let db = myDBs[key];
    delete db.children;
    delete db.backlinks;
    dbs.push( db );
  }

  await writeFolders( dbs );
  await fs.writeFile( `${advTitle}/adv.json`, JSON.stringify( dbs, null, 2 ) );
})();





