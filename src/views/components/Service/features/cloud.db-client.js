
import { io } from 'socket.io-client'

function connect({ url, dbname, userAgent, clientId, token }){
  return new Promise( ( resolve, reject ) => {
    if( !url || !userAgent || !token )
      return reject('Invalid Database Connection Parameters')
      
    const socket = io( url, {
      extraHeaders: { 'X-User-Agent': userAgent },
      reconnectionDelayMax: 20000,
      withCredentials: true,
      auth: { dbname, clientId, token }
    } )

    socket.on( 'connect', () => resolve( socket ) )
          .on( 'error', reject )
  } )
}

function Query( ios, collection ){

  this.insert = ( data, ops ) => {
    return new Promise( ( resolve, reject ) => {
      if( !data || typeof data != 'object' )
        return reject('Invalid Query Parameters')

      ios.emit( 'QUERY::INSERT', collection, data, ops || { returnId: true },
                ({ error, message, id }) => error ? reject( message ) : resolve( id ) )
    } )
  }

  this.find = ( query, ops ) => {
    return new Promise( ( resolve, reject ) => {
      if( !query || typeof query != 'object' )
        return reject('Invalid Query Parameters')

      ios.emit( 'QUERY::FIND', collection, query, ops || { limit: 100 },
                ({ error, message, results }) => error ? reject( message ) : resolve( results ) )
    } )
  }
  this.findOne = ( query, ops = {} ) => {
    return new Promise( ( resolve, reject ) => {
      if( !query || typeof query != 'object' )
        return reject('Invalid Query Parameters')

      ios.emit( 'QUERY::FINDONE', collection, query, ops, 
                ({ error, message, matche }) => error ? reject( message ) : resolve( matche ) )
    } )
  }

  this.update = ( query, data, ops = {} ) => {
    return new Promise( ( resolve, reject ) => {
      if( !query || typeof query != 'object'
          || !data || typeof data != 'object' )
        return reject('Invalid Query Parameters')

      ios.emit( 'QUERY::UPDATE', collection, query, data, ops, 
                ({ error, message, update }) => error ? reject( message ) : resolve( update ) )
    } )
  }

  this.delete = ( query, ops = {} ) => {
    return new Promise( ( resolve, reject ) => {
      if( !query || typeof query != 'object' )
        return reject('Invalid Query Parameters')

      ios.emit( 'QUERY::DELETE', collection, query, ops, 
                ({ error, message, count }) => error ? reject( message ) : resolve( count ) )
    } )
  }

  this.aggregate = pipeline => {
    return new Promise( ( resolve, reject ) => {
      if( !pipeline || typeof pipeline != 'object' )
        return reject('Invalid Query Parameters')

      ios.emit( 'QUERY::AGGREGATE', collection, pipeline, 
                ({ error, message, results }) => error ? reject( message ) : resolve( results ) )
    } )
  }
}

function DBInterface( options ){

  const { host, version, userAgent, clientId } = options
  if( !host || !clientId )
    throw new Error('[CloudDB] Invalid Database Access Configuration')

  // Initial instance configurations
  this.configs = {}
  // Database connection & transaction channel
  let dbname, ios, token
  
  this.connect = ({ name, collections, accessToken }) => {
    return new Promise( ( resolve, reject ) => {

      if( !name
          || !Array.isArray( collections ) 
          || !collections.length 
          || !accessToken )
        return reject('[CloudDB] Invalid Database Connection Parameters')
      
      // Instance configuration
      this.configs = { name, collections }
      // Targeted database name
      dbname = name
      // Compose database connection channel URL String
      token = accessToken

      /** Establish connection to database manager then
       *  resolve once connection
       */
      connect({ url: `${host}/cloudDB~${version || '1.0'}`, userAgent, dbname, clientId, token })
      .then( socket => {
        ios = socket
        // Add to each collections a query interface
        collections.map( each => DBInterface.prototype[ each ] = new Query( ios, each ) )
        resolve( this )
      })
      .catch( reject )
    } )
  }
  this.reconnect = () => {
    return new Promise( ( resolve, reject ) => {
      if( !dbname || !token || !this.configs.collections ) 
        return reject('[CloudDB] Undefined Database Connection Parameters')

      connect({ url: `${host}/cloudDB~${version || '1.0'}`, userAgent, dbname, clientId, token })
      .then( socket => {
        ios = socket
        // Reassign to each collections a query interface with new io connection
        this.configs.collections.map( each => DBInterface.prototype[ each ] = new Query( ios, each ) )
        resolve( this )
      })
      .catch( reject )
    } )
  }
  this.disconnect = () => {
    return new Promise( ( resolve, reject ) => {
      if( !ios )
        return reject('[CloudDB] No Active Connection Found')

      ios.disconnect( resolve )
    } )
  }

  this.rename = () => {}
  this.drop = () => {}
  this.size = () => {}
}

export default ( host, version, userAgent, clientId ) => {
  return new DBInterface({ host, version, userAgent, clientId })
}