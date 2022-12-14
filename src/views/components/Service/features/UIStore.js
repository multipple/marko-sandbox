
import Storage from 'all-localstorage'

export default prefix => {
  return new Storage({ prefix, encrypt: true })
}