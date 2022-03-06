
const TIMEOUT = 4000

function TestSession( { __id, __payload, description }, Manager ){

  this.Events = {}

  this.on = ( _event, listener ) => {
    if( !Array.isArray( this.Events[ _event ] ) )
      this.Events[ _event ] = []

    this.Events[ _event ].push( listener )
    return this
  }

  this.emit = ( _event, ...args ) => {
    if( !this.Events[ _event ] ) return
    this.Events[ _event ].map( fn => fn( ...args ) )
  }

  this.expects = ( label, validator ) => {
    const valid = typeof validator == 'function' ? validator() : true
    if( valid ) debugLog('! ', label )

    return this
  }

  this.export = data => Manager.export( __id, data )

  this.import = fields => {
    // Fields to import: Eg. '*' or 'name, email'
    return {
      from: fromId => {
        // From with session to import from
        const data = Manager.import( fromId )
        if( !data )
          throw new Error(`Import data from "${fromId}" not found`)

        if( !fields || fields == '*' ) return data
        
        if( typeof data !== 'object' || !Array.isArray( data ) )
          throw new Error(`Cannot destructure data of type <${typeof data}>`)

        const 
        destructure = fields.split(/\s*,\s*/),
        toReturn = {}

        destructure.map( field => {
          if( !data.hasOwnProperty( field ) )
            throw new Error(`"${fromId}" has no <${field}> exported field`)

          toReturn[ field ] = data[ field ]
        } )
        
        return toReturn
      }
    }
  }

  this.trigger = payload => {
    // Run session
    if( !payload && !__payload )
      throw new Error('Cannot run a session with no <payload>')

    // Inject test payload
    Manager.pipeThrough( payload || __payload )
  }

  this.next = async ( id, payload ) => await Manager.run( id, payload )
}

function EventCollector( executor ){
  // Fake executor methods to collect events defined within
  const clone = executor

  this.Events = {}

  this.run = () => {}
  this.import = () => { return { from: () => {} } }
  this.export = () => {}
  this.trigger = () => {}
  this.next = () => {}
  this.on = ( _event, listener ) => {
    this.Events[ _event ] = true
    return this
  }

  // Fake run executor
  this.list = () => {
    clone.bind(this)( () => {})
    return this.Events
  }
}

function camelCase( str ){
  if( !/\s*/.test( str ) ) return
  return str.toLowerCase().replace(/\s+/g, '-')
}

export default function Manager( options ){

  this.Registry = {}
  this.ActiveSessions = {}
  this.PipeFunction = null

  function _export( __id, data ){
    // Register exported data from session executor
    if( !this.Registry[ __id ] )
      throw new Error(`Invalid operation. "${__id}" Session not found`)
    
    this.Registry[ __id ].export = data
  }

  function _import( __id ){
    // Return exported data of a given session
    return this.Registry[ __id ] 
            && this.Registry[ __id ].export
  }

  function _pipeThrough( __payload ){
    // Pipe triggered session payload to external handler
    typeof this.PipeFunction == 'function'
    && this.PipeFunction( __payload )
  }

  this.session = ( about, payload, executor ) => {
    
    let __id
    const reg = {}

    switch( typeof about ){
      case 'string': __id = about
                    reg.description = about
        break
      case 'object': if( Array.isArray( about ) )
                        throw new Error('Expect first parameter <string> or <object>. <array> given')

                      if( !about.description )
                        throw new Error('Expect <description> field in first parameter object')
      
                    __id = about.id || about.description
                    reg.description = about.description
        break
      default: throw new Error('Expect first parameter to be <string> or <object>')
    }
    
    if( typeof payload == 'function' ){
      executor = payload
      reg.__payload = null
    }
    else reg.__payload = payload

    // TODO: Check payload validation scheme define by the app



    if( typeof executor !== 'function' )
      throw new Error('Expect second or third parameter to be the execution function')

    // Collect Events defined within the executor
    const evCollector = new EventCollector( executor )
    reg.events = evCollector.list()

    // Ready to run entrypoint
    const 
    thisManager = {
      run: this.run.bind(this),
      import: _import.bind(this), 
      export: _export.bind(this),
      pipeThrough: _pipeThrough.bind(this)
    },
    session = new TestSession( { __id, ...reg }, thisManager )

    reg.executor = executor.bind( session )
    reg.trigger = session.trigger
    reg.emit = session.emit

    // Register this session
    this.Registry[ __id ] = reg
  }

  this.run = ( __id, payload ) => {
    return new Promise( ( resolve, reject ) => {
      // Run specified next session
      const session = this.Registry[ __id ]
      if( !session )
        return reject(`Invalid operation. "${__id}" Session not found`)
      
      // Run test executor function
      debugLog(`--SESSION START--`)
      debugLog(`-## ${session.description}\n`)

      let timeout = options 
                    && options.delay 
                    && setTimeout( () => reject(`Running "${__id}" timeout`), options.delay )
      
      session.executor( () => {
        clearTimeout( timeout )

        delete this.ActiveSessions[ __id ]
        debugLog('--SESSION END--\n')
        resolve()
      } )
      
      /** Trigger test
       * NOTE: Session self defined payload will be use as fallback
       */
      ;( payload || session.__payload ) && session.trigger( payload )

      this.ActiveSessions[ __id ] = session
    } )
  }
  
  this.runAll = async () => {
    // Run all registered session respectively
    if( !Object.keys( this.Registry ).length )
      throw new Error(`Invalid operation. No session defined`)

    for( let __id in this.Registry )
      await this.run( __id, this.Registry[ __id ].__payload )
  }
  
  // Load test scripts
  this.load = async kitpath => {
    try {
      const 
      mod = require(`test/${kitpath}`),
      scripts = await ( await window.fetch( mod.default.toString() ) ).text()
      
      Function(`(function(test){${scripts}})(this)`).apply( this )
    }
    catch( error ){ debugLog('Error: ', error ) }
  }

  // Define interface that stream payloads from test triggerers to test handler
  this.pipe = fn => this.PipeFunction = fn

  // Dispatch event to active sessions
  this.event = ( ...args ) => this.ActiveSessions[ __id ].emit( ...args )
}