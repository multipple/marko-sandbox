import { fn } from "jquery"

const TIMEOUT = 4000

function TestSession( { __id, __input, description }, Manager ){

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

  this.trigger = input => {
    // Run session
    if( !input && !__input )
      throw new Error('Cannot run a session with no <input>')

    // Inject test input
    Manager.pipeThrough( input || __input )
  }

  this.next = async ( id, input ) => await Manager.run( id, input )
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

  function _pipeThrough( __input ){
    // Pipe triggered session input to extenal handler
    typeof this.PipeFunction == 'function'
    && this.PipeFunction( __input )
  }

  this.session = ( about, input, executor ) => {
    
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
    
    if( typeof input == 'function' ){
      executor = input
      reg.__input = null
    }
    else reg.__input = input

    // TODO: Check input.payload validation scheme define by the app



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

  this.run = ( __id, input ) => {
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
       * NOTE: Session self defined input will be use as fallback
       */
      ;( input || session.__input ) && session.trigger( input )

      this.ActiveSessions[ __id ] = session
    } )
  }
  
  this.runAll = async () => {
    // Run all registered session respectively
    if( !Object.keys( this.Registry ).length )
      throw new Error(`Invalid operation. No session defined`)

    for( let __id in this.Registry )
      await this.run( __id, this.Registry[ __id ].__input )
  }
  
  // Load test scripts
  this.load = async kitpath => {
    try {
      const 
      mod = await import(`test/${kitpath}`),
      scripts = await ( await window.fetch( mod.default.toString() ) ).text()
      
      Function(`(function(test){${scripts}})(this)`).apply( this )
    }
    catch( error ){ debugLog('Error: ', error ) }
  }

  // Define interface that stream inputs from test triggerers to test handler
  this.pipe = fn => this.PipeFunction = fn

  // Dispatch event to active sessions
  this.event = ( ...args ) => this.ActiveSessions[ __id ].emit( ...args )
}