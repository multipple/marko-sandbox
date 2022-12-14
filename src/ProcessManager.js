
import EventEmitter from 'events'
import CacheStorage from 'all-localstorage'

/**
 * Check metadata schema
 *
 */
function isValidMetadata( metadata ){
  return true
}

/**
 * Check process data schema
 *
 */
function isValidProcess( process ){
  return true
}

class EventHanlder extends EventEmitter {}

export default class ProcessManager extends EventHanlder {

  /**
   * Initialize process manager state
   * variables, cache, fetch & load installed
   * packages.
   *
   * @param {Object} configs
   *    - CPR   Access configuration to Cubic Package
   *            Repository: { server, version, scopeKey }
   *    - LPS   Locale Package Store client
   *    - UAT   User Account Type
   */
  constructor( configs ){
    super()

    if( !configs.CPR ) throw new Error('Undefined <CPR> configuration')
    if( !configs.LPS ) throw new Error('Undefined <LPS> configuration')
    if( !configs.UAT ) throw new Error('Undefined <UAT> configuration')

    this.CPR = configs.CPR
    this.LPS = configs.LPS
    this.UAT = configs.UAT

    // In-browser environment cache
    this.cache = new CacheStorage({ prefix: 'pm-cache', encrypt: true })
    this.cacheName = `${this.UAT.toLowerCase() }-process`

    this.__PROCESS_THREADS = this.cache.get( this.cacheName ) || {}
    this.__ACTIVE_APPLICATIONS = {}
    this.__FLASH_APPLICATIONS = this.cache.get( `${this.cacheName }-temp`) || {}
    this.__MIMETYPE_SUPPORT = {}
  }


  /**
   * Fetch and register all installed packages
   * to process threads list
   */
  async load(){
    const list = await this.LPS.fetch()

    Array.isArray( list )
    && await Promise.all( list.map( metadata => {
      const process = {
        loaded: false,
        status: 'LATENT',
        metadata,
        argv: {},
        stats: {}
      }

      this.register.bind(this)( process )
    } ) )

    // Close all temporary loaded apps
    Object.keys( this.__FLASH_APPLICATIONS ).map( this.quit.bind(this) )

    this.emit('ready')
  }


  /**
   * Return all existing process threads
   * state details
   */
  threads(){ return Object.values( this.__PROCESS_THREADS ) }


  /**
   * Return all loaded process theads
   * state details
   */
  loaded(){ return Object.values( this.__PROCESS_THREADS ).filter( ({ loaded }) => { return loaded } ) }


  /**
   * Return a list of process theads
   * state details by their current status
   *
   * @param {String} status   Process status: `LATENT`, `ACTIVE`, `STALLED`
   *
   */
  filter( status ){ return Object.values( this.__PROCESS_THREADS ).filter( each => { return each.status == status } ) }


  /**
   * Check whether a given process thread
   * exists
   *
   * @param {String} sid   Store id of installed package
   *
   */
  exists( sid ){ return !!this.__PROCESS_THREADS[ sid ] }


  /**
   * Check whether an application requires
   * or have a missing permissions
   *
   * @param {Object} metadata
   *
   */
  requirePermission({ resource }){
    return resource
            && resource.permissions
            && resource.permissions.scope
            && resource.permissions.scope.length
            && resource.permissions.scope.filter( each => {
              return typeof each == 'string'
                      || ( typeof each == 'object' && each.type && !each.access )
            } ).length
  }


  /**
   * Make an external request to get
   * authorization for mandatory permissions
   *
   * @param {String} type        Type of permission: `scope`, `feat`, `context`, ...
   * @param {Object} requestor   Metadata of package requesting permissions
   * @param {Array} list        List of mandatory permissions
   *
   */
  askPermission( type, requestor, list ){
    return new Promise( resolve => {
      this.emit('permission-request', { type, requestor, list }, resolve )
    } )
  }


  /**
   * Generate public access URL of a favicon
   * asset deployed on a CPR
   *
   * @param {Object} metadata
   *
   */
  favicon( metadata ){
    if( !isValidMetadata( metadata ) ) return ''

    const { namespace, nsi, version, favicon } = metadata
    return `${this.CPR.server}/${namespace}/${nsi}~${version}/${favicon}`
  }


  /**
   * Register new process thread
   *
   * @param {Object} process
   *
   * NOTE: Requires & await for mandatory
   *       permissions to complete the registration
   */
  async register( process ){

    if( !isValidProcess( process ) ) return

    const { sid, type, name, runscript, resource } = process.metadata
    if( this.__ACTIVE_APPLICATIONS[ name ] ) {
      // Throw process already exist alert
      this.emit('alert', 'PROCESS_EXIST', process.metadata )
      return false
    }

    /**
     * Send out mandatory permission request
     *
     * IMPORTANT: Wait for feedback to continue the
     * registration.
     */
    if( this.requirePermission( process.metadata ) ) {
      const list = await this.askPermission( 'scope', process.metadata, resource.permissions.scope )

      if( Array.isArray( list ) ) {
        resource.permissions.scope = list
        await this.LPS.update( sid, { resource })
      }
    }

    this.__PROCESS_THREADS[ sid ] = process

    // Maintain a dedicated list of applications process ids: Auto-loadable or not
    if( type == 'application' ) {
      this.__ACTIVE_APPLICATIONS[ name ] = sid

      if( resource && resource.services && !isEmpty( resource.services ) ) {
        // Application that can `EDIT` file or data
        Array.isArray( resource.services.editor )
        && resource.services.editor.map( mime => {
          if( !this.__MIMETYPE_SUPPORT[ mime ] ) this.__MIMETYPE_SUPPORT[ mime ] = []
          this.__MIMETYPE_SUPPORT[ mime ].push({ sid, name, type: 'editor' })
        })

        // Application that can `READ` file or data
        Array.isArray( resource.services.reader )
        && resource.services.reader.map( mime => {
          if( !this.__MIMETYPE_SUPPORT[ mime ] ) this.__MIMETYPE_SUPPORT[ mime ] = []
          this.__MIMETYPE_SUPPORT[ mime ].push({ sid, name, type: 'reader' })
        })
      }
    }

    /**
     * Register globally all auto-loadable processes
     * define by "runscript" configurations.
     */
    if( runscript
        && ( ( runscript[ this.UAT ] && runscript[ this.UAT ].autoload ) // Specific account
              || ( runscript['*'] && runscript['*'].autoload ) ) ) { // All account
      this.__PROCESS_THREADS[ sid ].loaded = true
      this.emit('refresh', { loaded: this.loaded(), actives: this.filter('ACTIVE') })
    }
  }


  /**
   * Unregister a process
   *
   * @param {String} sid   Store id of installed package
   *                       Use as process ID as well
   *
   */
  unregister( sid ){

    if( !this.__PROCESS_THREADS[ sid ] ) return

    const { loaded, metadata } = this.__PROCESS_THREADS[ sid ]
    delete this.__PROCESS_THREADS[ sid ]

    // Close auto-loaded application if running
    if( !loaded || !this.quit( metadata.name ) ) return
    delete this.__ACTIVE_APPLICATIONS[ metadata.name ]

    this.emit('refresh', { loaded: this.loaded(), actives: this.filter('ACTIVE') })
  }


  /**
   * Return a given process metadata
   *
   * @param {String} query   Match metadata `sid`, `name` or `nsi`
   *
   */
  metadata( query ){
    // Retreive a given process metadata by sid or name or nsi
    for( const sid in this.__PROCESS_THREADS ) {
      const { metadata } = this.__PROCESS_THREADS[ sid ]

      if( query == sid
          || metadata.nsi == query
          || metadata.name == query )
        return { ...metadata, favicon: this.favicon( metadata ) }
    }

    // Workspace alert message
    this.emit('alert', 'PROCESS_NOT_FOUND', query )
    return null
  }


  /**
   * Unregister a process
   *
   * @param {String} type   Opening data or file MIME type
   * @param {Object} argv   Input argument variables to run the process
   *
   */
  open( type, argv = {} ){

    if( !Array.isArray( this.__MIMETYPE_SUPPORT[ type ] ) ) {
      console.log('[EXT]: No process to read this datatype found')
      return false
    }

    for( let o = 0; o < this.__MIMETYPE_SUPPORT[ type ].length; o++ )
      if( this.__MIMETYPE_SUPPORT[ type ][ o ].defaultHandler ) {
        this.run( this.__MIMETYPE_SUPPORT[ type ][ o ].name, argv )
        return true
      }

    // Select first handler by default
    this.run( this.__MIMETYPE_SUPPORT[ type ][0].name, argv )
    return true
  }


  /**
   * Spawn a new process
   *
   * @param {String} sid    User installed package store ID as process ID
   * @param {Object} argv   Input argument variables to run the process
   *
   */
  spawn( sid, argv = {} ){

    if( !this.__PROCESS_THREADS[ sid ] )
      throw new Error(`Process <${sid}> not found`)

    const
    ActiveProcesses = this.filter('ACTIVE'),
    hightIndex = ActiveProcesses.length > 1 ?
                    Math.max( ...( ActiveProcesses.map( ({ index }) => { return index } ) ) )
                    : ActiveProcesses.length

    // Clear notification badge event
    this.emit('notification-clear', sid )

    // Default workspace view mode
    let WSMode = false

    // Activate a new process
    if( this.__PROCESS_THREADS[ sid ].status !== 'ACTIVE' ) {
      this.__PROCESS_THREADS[ sid ] = { ...this.__PROCESS_THREADS[ sid ], status: 'ACTIVE', argv }

      // Process has a default workspace view mode
      const { runscript } = this.__PROCESS_THREADS[ sid ].metadata
      WSMode = runscript
                && ( runscript.workspace
                    || ( runscript[ this.UAT ] && runscript[ this.UAT ].workspace )
                    || ( runscript['*'] && runscript['*'].workspace ) )
    }
    // No re-indexing required when 0 or only 1 process thread is active
    else if( hightIndex <= 1 ) {
      // Update the `argv` of this active process
      if( argv ) {
        this.__PROCESS_THREADS[ sid ].argv = argv

        this.cache.set( this.cacheName, this.__PROCESS_THREADS )
        this.emit( 'refresh', { loaded: this.loaded(), actives: this.filter('ACTIVE') })
      }

      return
    }

    this.__PROCESS_THREADS[ sid ].index = hightIndex + 1 // Position targeted view block to the top

    this.cache.set( this.cacheName, this.__PROCESS_THREADS )
    this.emit( 'refresh', { loaded: this.loaded(), actives: this.filter('ACTIVE') })

    // Show Aside in default/auto mode
    ;( !ActiveProcesses.length || WSMode ) && this.emit( 'ws-mode', { mode: WSMode || 'auto' } )
  }


  /**
   * Refresh a running process in-memory
   * metadata with LPS metadata
   *
   * @param {String} sid    Installed package store ID used as process ID
   *
   */
  async refresh( sid ){
    try {
      // Get latest version of its metadata
      const metadata = await this.LPS.get({ sid })
      if( !metadata ) throw new Error('Unexpected Error Occured')

      // Replace process metadata
      this.__PROCESS_THREADS[ sid ].metadata = metadata

      // Re-run the process with current argv if active
      this.__PROCESS_THREADS[ sid ].status == 'ACTIVE'
      && this.spawn( sid, this.__PROCESS_THREADS[ sid ].argv )

      this.emit( 'refresh', { loaded: this.loaded(), actives: this.filter('ACTIVE') })
    }
    catch( error ) { console.log('Failed Refreshing Process: ', error ) }
  }


  /**
   * Kill a running process
   *
   * @param {String} sid    Installed package store ID used as process ID
   *
   */
  kill( sid ){
    // Is not active
    if( this.__PROCESS_THREADS[ sid ].status !== 'ACTIVE' )
      return false

    // Send quit signal to the application
    this.emit('signal', sid, 'USER:QUIT')

    this.__PROCESS_THREADS[ sid ] = { ...this.__PROCESS_THREADS[ sid ], status: 'LATENT', argv: {} }
    this.cache.set( this.cacheName, this.__PROCESS_THREADS )

    // Delete process in case it has flash flag
    if( this.__FLASH_APPLICATIONS[ sid ] ) {
      this.__PROCESS_THREADS[ sid ].loaded = false
      delete this.__FLASH_APPLICATIONS[ sid ]

      this.cache.set( `${this.cacheName }-temp`, this.__FLASH_APPLICATIONS )
    }

    this.emit('refresh', { loaded: this.loaded(), actives: this.filter('ACTIVE') })
    this.emit('ws-mode', { mode: !this.filter('ACTIVE').length ? 'ns' : 'auto' })
  }


  /**
   * Run an application
   *
   * @param {String} name    App name
   * @param {Object} argv    Input argument variables to run the app
   *
   */
  run( name, argv = {} ){

    if( !this.__ACTIVE_APPLICATIONS[ name ] ) {
      this.emit('alert', 'APPLICATION_NOT_FOUND', name )
      return false
    }

    const sid = this.__ACTIVE_APPLICATIONS[ name ]

    // Start new process
    this.spawn( sid, argv )

    // Temporary load application to loaded list: Get removed when quit
    if( !this.__PROCESS_THREADS[ sid ].loaded ) {
      this.__PROCESS_THREADS[ sid ].loaded = true

      this.__FLASH_APPLICATIONS[ sid ] = this.__PROCESS_THREADS[ sid ].metadata.name
      this.cache.set( `${this.cacheName }-temp`, this.__FLASH_APPLICATIONS )

      this.cache.set( this.cacheName, this.__PROCESS_THREADS )
      this.emit( 'refresh', { loaded: this.loaded(), actives: this.filter('ACTIVE') })
    }

    // Provide chain control methods of running process
    return {
      quit: () => this.quit.bind(this)( name ),
      refresh: () => this.refresh.bind(this)( sid )
    }
  }


  /**
   * Quit an application
   *
   * @param {String} name    App name
   *
   */
  quit( name ){

    if( !this.__ACTIVE_APPLICATIONS[ name ] ) {
      // Throw no found process alert
      this.emit('alert', 'APPLICATION_NOT_FOUND', name )
      return false
    }

    this.kill( this.__ACTIVE_APPLICATIONS[ name ] )
    return true
  }
}