
import './utils'
import IOF from 'iframe.io'
import { loadExt } from './lib/ExtensionManager'
import Locales from 'root/locales/manifest.json'
import Config from 'root/../config.json'
import Views from './views'

import Tenant from './data/tenant.json'
import User from './data/user.json'


const
accountType = 'ADMIN',
tenantData = {
  ...Tenant,
  // Overwriddens
},
userData = {
  ...User,
  // Overwriddens
  accounttype: accountType,
  language: 'en'
},
Theme = {
  name: 'smoothy~1.0',
  mode: 'light',
  color: 'default'
}

function controlChannel(){
  // Initial connection with content window
  return new Promise( resolve => {
    window.iof = new IOF({ debug: true })

    iof.listen()
    .on( 'signal', code => GState.extension.signal( Config.nsi, code ) )

    .on( 'theme:change', data => GState.set( 'theme', data ) )
    .on( 'ws:change', data => GState.workspace.layout( data ) )
    .on( 'screen:change', data => GState.set( 'screen', data ) )
    .on( 'locale:change', data => GState.locale.switch( data ) )

    .on( 'user:change', data => GState.set( 'user', { ...GState.get('user'), ...data } ) )
    .on( 'context:change', data => GState.workspace.context( data ) )

    // Channel connection established
    .on( 'connect', () => {
      iof.emit('start')
      resolve()
    } )
    
    // Report error stack to emulator
    GTrace.listen( error => iof.emit( 'console:log', { name: Config.name, type: 'error', error, status: 'danger' } ))
  } )
}

async function initialStates(){
  
  GState.set( 'theme', Theme )
  GState
  .define('theme')
  .action( 'mode', value => {

    let theme = GState.get('theme')
    theme = { ...theme, mode: value }

    GState.dirty( 'theme', theme )
  } )

  GState.set( 'tenant', tenantData )
  GState.set( 'user', userData )
  GState.set( 'locales', Locales || {} )

  /*----------------------------------------------------------------*/
  /* Initial Workspace State: 
    - Context: Use for extensions & user activities tracking by page
                @params: 
                  - accountType(Admin, Instructor, Learner)
                  - page( route name )
                  - event( name, ID )
    - Layout: Display or main blocks of the workspace
          @params:
            - mode: UI segmentation mode
                - qs (Quater state)
                - hs (Half section)
                - ns (No-section)
  */
  const wsStoreAttr = 'workspace-'+ accountType

  GState.set('workspace', { mode: 'ns', ...(uiStore.get( wsStoreAttr ) || {}) })
  GState
  .define('workspace')
  // Update workspace Layout
  .action( 'layout', newState => {

    const recentState = GState.get('workspace')
    if( newState.mode == 'ns' && recentState.mode !== 'ns' )
      newState.previousMode = recentState.mode

    else if( newState.mode == 'auto' )
      newState.mode = recentState.previousMode || 'qs'
    
    newState = Object.assign( {}, recentState, newState )

    GState.dirty( 'workspace', newState )
    uiStore.set( wsStoreAttr, newState )
  } )
  // Set/Define workspace context
  .action( 'context', newState => {

    const wsState = GState.get('workspace')
    wsState.context = { ...(wsState.context || {}), accountType, ...newState }

    GState.dirty( 'workspace', wsState )
  } )

  /*----------------------------------------------------------------*/
  /* Locale text translation method from
    JS script. Helps when the need of transation
    is out of a component
  */
  function initLocale( locale ){
    return new Promise( ( resolve, reject ) => {
      const [ language, variant ] = locale.split('-')
      // Fetch another dictionary
      try {
        const locale = Locales[ language ]
        if( !locale ) 
          return reject('${locale} language dictionary not found')

        const dictionary = require(`root/locales/${locale.dictionary}`)
        GState.set( 'locale', { language, variant, dictionary } )
        resolve()
      }
      catch( error ){ reject( error ) }
    } )
  }

  window.Locale = text => {
    /* Static translation
      {
        ...
        "User account": "Compte utilisateur",
        ...
      }
    */
    const { language, variant, dictionary } = GState.get('locale')

    let translation = dictionary[ text ] || text

    /* Select defined variance
      {
        ...
        "Buy now": {
            "US": "Buy now",
            "UK": "Purchase now",
            "default": "US"
        }
        ...
      }
    */
    if( typeof translation == 'object' ){
      // Specified variant defined
      if( variant
          && translation.hasOwnProperty( variant ) )
        translation = translation[ variant ]

      // User default define variant
      else {
        const defaultVariant = translation['default']

        translation = ( defaultVariant
                        && translation[ defaultVariant ] )
                      || text
      }
    }

    return translation
  }

  // Init locale language handlers
  try { await initLocale( ( userData && userData.language ) || navigator.language ) }
  catch( error ){
    console.error('[CLIENT-LOAD]- Failed to init Locale language: ', error )
    // Fetch en-US dictionary by default
    await initLocale('en-US')
  }
  
  // Language Switcher
  GState
  .define('locale')
  .action( 'switch', async locale => await initLocale( locale ) )
}

async function run(){
  // Load installed Extensions
  await loadExt( accountType )
  // Render UI Views
  Views.renderSync( Config ).prependTo( document.body )
}

( async () => {
  // Sandbox initial states
  await initialStates()
  // Sandbox to Emulator control channel
  await controlChannel()
  // Run sandbox
  await run()
} )()