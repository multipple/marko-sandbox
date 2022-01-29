
import './utils'
import { loadExt } from './lib/ExtensionManager'
import Locales from '~/locales/manifest.json'
import Config from '~/../config.json'
import Views from './views'

;( async () => {
  // Dummy data
  const
  accountType = 'Admin',
  tenant = {
    name: 'Test Tenant'
  },
  userData = {
		accounttype: accountType,
    language: 'fr-FR'
  },
  Theme = {
    name: 'smoothy~1.0',
    mode: 'light'
  }

  /*----------------------------------------------------------------*/
  // Initial States
  GState.set( 'theme', Theme )
  GState.set( 'tenant', tenant )
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
    wsState.context = Object.assign( wsState.context || {}, newState, { accountType } )

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

        const dictionary = require(`~/locales/${locale.dictionary}`)
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

  /*----------------------------------------------------------------*/
  // Initial media window sizes
  function initScreenSet( e ){

    const
    $window =  $( e && e.target ? this : document ),
    width = $window.width(),
    height = $window.height()

    let media = 'xs'

    if( width >= 576 ) media = 'sm'
    if( width >= 768 ) media = 'md'
    if( width >= 992 ) media = 'lg'
    if( width >= 1200 ) media = 'xl'
    
    GState.set( 'screen', { media, width, height } )
  }

  initScreenSet()
  // Watch screen resize for responsiveness updates
  $(window).on( 'resize', initScreenSet )

  /*----------------------------------------------------------------*/
  // Load installed Extensions
  await loadExt( accountType )

  /*----------------------------------------------------------------*/
	// Render UI Views
	Views.renderSync( Config ).prependTo( document.body )
} )()
