
import './utils'
import IOF from 'iframe.io'
// import * as EM from '@multipple/extension-manager'
import Views from './views'

import LPSClient from './LPSClient'
import ProcessManager from './ProcessManager'
import Metadata from 'root/../.metadata'

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
  language: 'fr-FR'
},
Theme = {
  name: 'smoothy~1.0',
  mode: 'light',
  color: 'default'
}

function controlChannel(){
  // Initial connection with content window
  return new Promise( ( resolve, reject ) => {
    window.iof = new IOF({ debug: true })

    iof
    .listen()
    .on( 'signal', code => GState.service.signal( Metadata.nsi, code ) )

    .on( 'theme:change', data => GState.set( 'theme', data ) )
    .on( 'ws:change', data => GState.workspace.layout( data ) )
    .on( 'screen:change', data => GState.set( 'screen', data ) )
    .on( 'locale:change', data => GState.set( 'locale', data ) )

    .on( 'user:change', data => GState.set( 'user', { ...GState.get('user'), ...data } ) )
    .on( 'context:change', data => GState.workspace.context( data ) )

    // Channel connection established
    .on( 'connect', () => {
      iof.emit('start')
      resolve()
    } )

    setTimeout( () => reject('[TIMEOUT]: Sandbox server failed to connect to Emulator: ./client.js'), 8000 )
    
    /*----------------------------------------------------------------*/
    // Report error stack to emulator
    GTrace.listen( error => iof.emit( 'console:log', { name: Metadata.name, type: 'error', error, status: 'danger' } ))

    /*----------------------------------------------------------------*/
    // Forward API request to Emulator
    window.Request = ( url, method, body, headers ) => {

      function isProcess( verb ){ return ['install', 'uninstall'].includes( verb ) }

      return new Promise( ( resolve, reject ) => {
        let 
        options = { url, method: method || 'GET', body, headers },
        verb = 'api',
        formatResponse = resp => {
          return isProcess( verb ) ? { error: false, message: 'Service '+ verb, sid: resp } : resp
        }

        if( url.includes('uninstall') ) verb = 'uninstall' 
        else if( url.includes('install') ) verb = 'install'

        if( isProcess( verb ) ) options = body

        iof.emit( `request:${verb}`, options, ( error, response ) => error ? reject( error ) : resolve( formatResponse( response ) ) )
      } )
    }
  } )
}

async function initialStates(){
  /** 
   * Global flag to put every external
   * library & features in SANDBOX mode.
   */
  window.SANDBOX = true
  
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
  
  /*----------------------------------------------------------------*/
  /* Initial Workspace State: 
    - Context: Use for services & user activities tracking by page
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
}

async function preinstall( metadata ){
  try {
    const { error, message, sid } = await window.Request('/extension/install', 'POST', metadata )
    if( error ) throw new Error( message )
    
    return sid
  }
  catch( error ){ console.log('Error Installing Service: ', error ) }
}

async function start(){
  // Render UI Views
  Views.renderSync( Metadata ).prependTo( document.body )

  // Define Process Manager
  window.CUBIC_PROCESS_MANAGER = new ProcessManager({
                                                      CPR: {
                                                        server: '',
                                                        accessToken: '',
                                                        scopeToken: ''
                                                      },
                                                      LPS: LPSClient,
                                                      UAT: accountType
                                                    })

  window.CUBIC_PROCESS_MANAGER
  .on('alert', ( type, body ) => console.log(`Alert: [${type}] - `, body ) )
  .on('refresh', ({ loaded, actives }) => {
    console.log('Loaded: ', loaded )
    console.log('Actives: ', actives )
  })
  .on('permission-request', ({ type, requestor, list }, fn ) => {
    console.log('Ask Permission: ', type, requestor, list )

    // Grant permissions
    fn([
      { type: 'tenant.apps', access: 'GRANTED' },
      { type: 'user.*', access: 'GRANTED' },
      { type: 'tenant.*', access: 'GRANTED' }
    ])
  })

  // pre-install & register the service
  const sid = await preinstall( Metadata )

  // Register Services into process manager
  await window.CUBIC_PROCESS_MANAGER.register({ metadata: { sid, ...Metadata } })
  // The signal <Service/> to load
  sid && GState.set( 'running', true )
}

( async () => {
  try {
    // Sandbox initial states
    await initialStates()
    // Sandbox to Emulator control channel
    await controlChannel()
    // Start/Run sandbox
    await start()
  }
  catch( error ){ console.error( error ) }
} )()