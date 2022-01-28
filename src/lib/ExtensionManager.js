
let
AccountType, 
storeAttr

const 
__EXTS__ = {},
__EXTNS__ = {},
AutoLoadedExts = {},
MimeTypeSupportExts = {}

function isExtension(){

  return true
}

function runExt( id, payload ){
  const 
  actives = GState.get('activeExtensions'),
  values = Object.values( actives ),
  maxIndex = values.length > 1 ?
                  Math.max( ...( values.map( ({ zindex }) => { return zindex } ) ) )
                  : values.length
                  
  // Clear notification badge this has on the toolbar
  GState.notification.clear( id )
  
  // Default workspace view mode
  let WSMode = false

  // Load new extension
  if( !actives.hasOwnProperty( id ) ){
    actives[ id ] = __EXTS__[ id ]

    // Extension has a default workspace view mode
    const { runscript } = actives[ id ]
    WSMode = runscript
              && ( runscript.workspace
                  || ( runscript['*'] && runscript['*'].workspace )
                  || ( runscript[ AccountType ] && runscript[ AccountType ].workspace ) )
  }
  
  // No re-position required for single view block
  else if( maxIndex <= 1 ){

    // Add specified operation payload to loaded extension
    if( payload ){
      // actives[ id ].payload = payload

      GState.dirty( id, payload )
      GState.dirty( 'activeExtensions', actives )
      uiStore.set( storeAttr, actives )
    }

    return
  }

  // Add specified operation payload to extension
  if( payload ){
    // actives[ id ].payload = payload
    GState.dirty( id, payload )
  }

  actives[ id ].zindex = maxIndex + 1 // Position targeted view block to the top
  GState.dirty( 'activeExtensions', actives )
  uiStore.set( storeAttr, actives )

  // Show Aside in default/auto mode
  ;( !values.length || WSMode ) && GState.workspace.layout({ mode: WSMode || 'auto' })
}

function quitExt( id ){

  const actives = GState.get('activeExtensions')
  // Is not active
  if( !actives.hasOwnProperty( id ) ) return

  delete actives[ id ]
  GState.set( 'activeExtensions', actives )
  uiStore.set( storeAttr, actives )

  // Hide Aside when all extension & marketplace are closed
  !GState.get('marketplace')
  && GState.workspace.layout({ mode: !Object.keys(actives).length ? 'ns' : 'auto' })
}

async function refreshExt( id, payload ){
  try {
    // Get latest version of its metadata
    const metadata = await getExt( id )
    if( !metadata ) throw new Error('Unexpected Error Occured')

    // Replace extension metadata
    __EXTS__[ id ] = metadata
    __EXTNS__[ metadata.name ] = metadata
    
    // Re-run the extension with current payload if active
    const actives = GState.get('activeExtensions')
    if( actives.hasOwnProperty( id ) ){
      delete actives[ id ]
      runExt( id, payload )
    }
  }
  catch( error ){ console.log('Failed Refreshing Extension: ', error ) }
}

function requirePermission({ resource }){
  // Check whether an application requires or have a missing permissions
  return resource
          && resource.permissions
          && resource.permissions.scope
          && resource.permissions.scope.length
          && resource.permissions.scope.filter( each => {
            return typeof each == 'string'
                    || ( typeof each == 'object' && each.type && !each.access )
          } ).length
}

async function askPermission( type, requestor, list, __callback ){

  function exec( resolve ){

    function callback( list ){
      GState.set('permissionRequest', null )
      resolve( list )
    }
    
    GState.set('permissionRequest', { type, requestor, list, callback })
  }

  // JS callback method
  if( typeof __callback == 'function' )
    return exec( __callback )

  // or return promise: async/await
  return new Promise( exec )
}

// Extension handler API class
function ExtensionManager( id, metadata ){
  
  this.id = id
  this.meta = metadata
  this.payload = null
  
  this.run = payload => {
    this.payload = payload
    runExt( this.id, payload )
  }

  this.quit = () => {
    this.payload = null
    quitExt( this.id )
  }

  this.refresh = async () => refreshExt( this.id, this.payload )
}

GState
.define('extension')
.action( 'open', runExt )
.action( 'close', quitExt )

// Ask for data or hook access permissions
GState
.define('permission')
.action( 'ask', askPermission )
.action( 'check', () => {} )

window.Extensions = {

  list: {},

  run: ( name, payload ) => {

    if( !window.Extensions.list.hasOwnProperty( name ) ){

      // TODO: Throw no found extension dialog

      return false
    }

    window.Extensions.list[ name ].run( payload )
    return true
  },

  quit: name => {

    if( !window.Extensions.list.hasOwnProperty( name ) ){

      // TODO: Throw no found extension dialog

      return false
    }

    window.Extensions.list[ name ].quit()
    return true
  },

  meta: query => {
    // Retreive a given extension details by id or name
    for( let id in __EXTS__ )
      if( query == id || __EXTS__[ id ].name == query )
        return Object.assign( __EXTS__[ id ], { id } )
    
    // Extension not found
    let 
    byAccount = 'Install it from the marketplace to continue', // Default (Admin)
    actions = {
      passive: {
        label: 'Go to Marketplace',
        gstate: {
          target: 'marketplace',
          call: 'open',
          arguments: [{ open: { name: query } }] 
        }
      }
    }
    
    // Learner or Admin account get different message: Not allow to install themeselves
    if( GState.get('user').accounttype != 'ADMIN' ){
      byAccount = 'Contact your administrators for support'
      actions = false
    }

    // Workspace alert message
    GState.global.alert({
      status: 'Alert',
      message: `The Extension <span class="text-primary">${query}</span> is not available in your workspace. ${byAccount}.`,
      actions
    })
  },

  install: async extension => {
    
    if( !isExtension( extension ) || AccountType == 'Studio' ) return
    if( window.Extensions.list.hasOwnProperty( extension.name ) ){

      // TODO: Throw extension already exist dialog

      return false
    }

    /** Ask user to grant permission requested by the 
     * extension before to proceed with the installation 
     */
    if( requirePermission( extension ) ){
      const list = await askPermission( 'scope', extension, extension.resource.permissions.scope )
      if( Array.isArray( list ) )
        extension.resource.permissions.scope = list
    }

    try {
      const { error, message, extensionId } = await window.Request('/extension/install', 'POST', extension )
      if( error ) throw new Error( message )

      // Register extension globally
      window.Extensions.register({ id: extensionId, ...extension })
      return extensionId
    }
    catch( error ){
      console.log('Error Installing Extension: ', error )
      return false
    }
  },

  uninstall: async id => {

    if( !id || AccountType == 'Studio' ) return
    try {
      const { error, message } = await Request(`/extension/${id}/uninstall`, 'DELETE')
      if( error ) throw new Error( message )

      // Unregister extension globally
      window.Extensions.unregister( id )
      return true
    }
    catch( error ){
      console.log('Error Uninstalling Extension: ', error )
      return false
    }
  },

  register: extension => {
    
    const { id, name, runscript, resource } = extension

    // Add extension to loaded list
    __EXTS__[ id ] =
    __EXTNS__[ name ] = extension

    /** Register globally all auto-loadable extensions
     * that can show on toolbar by checking "runscript" 
     * configuration rules
     * 
     * NOTE: Some extensions are not meant to 
     * display in the toolbar/Aside.
     */
    if( runscript
        && ( ( runscript['*'] && runscript['*'].autoload ) // All account
              || ( runscript[ AccountType ] && runscript[ AccountType ].autoload ) ) ){ // Specific account
      window.Extensions.list[ name ] = new ExtensionManager( id, extension )
      AutoLoadedExts[ id ] = extension

      if( resource && resource.services && !isEmpty( resource.services ) ){
        // Extensions capable of reading particular type of file or data
        Array.isArray( resource.services.editor ) 
        && resource.services.editor.map( mime => {
          if( !MimeTypeSupportExts[ mime ] ) MimeTypeSupportExts[ mime ] = []
          MimeTypeSupportExts[ mime ].push({ id, name: extension.name, type: 'editor' })
        })
        // Extensions capable of editing particular type of file or data
        Array.isArray( resource.services.reader )
        && resource.services.reader.map( mime => {
          if( !MimeTypeSupportExts[ mime ] ) MimeTypeSupportExts[ mime ] = []
          MimeTypeSupportExts[ mime ].push({ id, name: extension.name, type: 'reader' })
        })
      }

      GState.dirty('Extensions', AutoLoadedExts )
    }
  },

  unregister: id => {
    
    if( !__EXTS__[ id ] ) return
    const { name } = __EXTS__[ id ]

    delete __EXTS__[ id ]
    delete __EXTNS__[ name ]
    
    // Close auto-loaded application if running
    if( !AutoLoadedExts[ id ] || !window.Extensions.quit( name ) ) return
    
    // Delete from workspace
    delete window.Extensions.list[ name ]
    delete AutoLoadedExts[ id ]
    
    // Refresh workspace extensions
    GState.dirty('Extensions', AutoLoadedExts )
  },

  open: ( type, payload ) => {
   
    if( !Array.isArray( MimeTypeSupportExts.hasOwnProperty( type ) ) ){
      console.log('[EXT]: No extension to read this datatype found')
      return false
    }

    for( let o = 0; o < MimeTypeSupportExts[ type ].length; o++ )
      if( MimeTypeSupportExts[ type ][ o ].defaultHandler ){
        window.Extensions.run( MimeTypeSupportExts[ type ][ o ].name, payload )
        return true
      }

    // Select first handler by default
    window.Extensions.run( MimeTypeSupportExts[ type ][0].name, payload )
    return true
  },
  
  isInstalled: arg => { return __EXTS__.hasOwnProperty( arg ) || __EXTNS__.hasOwnProperty( arg ) }
}

export const loadExt = async accountType => {
  
  AccountType = accountType.toLowerCase()
  storeAttr = 'active-extensions-'+ AccountType

  // Initialize extensions state handler
  GState.set( 'activeExtensions', uiStore.get( storeAttr ) || {} )

  // Fetch all installed extensions
  const list = await fetchExt()
  
  if( !isEmpty( list ) )
    list.map( ({ extensionId, ...rest }) => window.Extensions.register({ id: extensionId, ...rest }) )

  // List of auto-loaded extensions
  GState.set('Extensions', AutoLoadedExts )
  return AutoLoadedExts
}

export const getExt = async id => {
  // Get an installed extension info
  try { return require('~/../config.json') }
  catch( error ){
    console.log('Failed Retreiving an Extension: ', error )
    return
  }
}

export const fetchExt = async query => {
  // Fetch all installed extension or query a specific category
  try { return [ require('~/../config.json') ] }
  catch( error ){
    console.log('Failed Fetching Extensions: ', error )
    return []
  }
}

export default { loadExt, fetchExt, getExt }