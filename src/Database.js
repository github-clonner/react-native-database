import Realm from 'realm';
import { generateUUID } from './utilities';
import { CHANGE_TYPES } from '../index';

export class Database {

  /**
   * Create a new database with the given schema.
   * @param  {object} schema Contains a schema and a schemaVersion, in the format
   *                         expected by Realm
   * @return {none}
   */
  constructor(schema) {
    this.realm = new Realm(schema);
    this.listeners = new Map();
  }

  /**
   * Indicates if this database contains any objects
   * N.B. relies on realm 1.10.0 or greater
   * @return {boolean}  Whether the database is empty
   */
  getIsEmpty() {
    return this.realm.empty;
  }

  /**
   * Adds a function to the array of functions to call when the database changes.
   * @param {Function} callback Function to call when a change is made to the
   *                            database. Should expect a change type, record type,
   *                            and an object representing the record pre-change.
   * @return {string}          The id of the callback being added
   */
  addListener(callback) {
    const id = generateUUID();
    this.listeners.set(id, callback);
    return id;
  }

  /**
   * Removes the callback with the specified id, if it exists
   * @param  {string} id Id of the callback to remove
   * @return {none}
   */
  removeListener(id) {
    this.listeners.delete(id);
  }

  /**
   * Calls each callback in the array of listeners with the provided arguments.
   * @param  {array} ...args The arguments to pass on to each callback
   * @return {none}
   */
  alertListeners(...args) {
    this.listeners.forEach((callback) => callback(...args));
  }

  /**
   * Creates and returns an object of the given type in the database with the
   * specified properties. Fails if there is a clashing primary key.
   * @param  {string} type       Database object type being updated
   * @param  {object} properties The properties for the database object
   * Any extra params are passed directly on to change listeners. The use case is
   * passing identifying information about the change, for example, changes caused
   * by a sync system could have 'sync' passed through as an extra parameter.
   * @return {Realm.Object}      The database object that was created
   */
  create(type, properties, ...listenerArgs) {
    const object = this.realm.create(type, properties);
    this.alertListeners(CHANGE_TYPES.CREATE, type, object, ...listenerArgs);
    return object;
  }

  /**
   * Returns the database object with the given id, if it exists, or creates a
   * placeholder with that id if it doesn't.
   * @param  {string} type             The type of database object
   * @param  {string} primaryKey       The primary key of the database object, usually its id
   * @param  {string} primaryKeyField  The field used as the primary key, defaults to 'id'
   * @return {Realm.object}            Either the existing database object with the given
   *                                   primary key, or a placeholder if none
   */
  getOrCreate(type, primaryKey, primaryKeyField = 'id', ...listenerArgs) {
    if (!primaryKey || primaryKey.length < 1) return null;
    const results = this.objects(type).filtered(`${primaryKeyField} == $0`, primaryKey);
    if (results.length > 0) return results[0];
    return this.create(type, { [primaryKeyField]: primaryKey }, ...listenerArgs);
  }

  /**
   * Deletes a specific object from the database.
   * @param  {Realm.Object} object  Object to be deleted, also can accept an array of Objects
   *                                of same type to be deleted.
   * @param  {string} type          Type of the object(s) to be deleted
   * Any extra params are passed directly on to change listeners
   * @return {none}
   */
  delete(type, object, ...listenerArgs) {
    // Test if the object is a RealmObject by checking if it has the function objectSchema(). If it
    // is, stick it in an array. Otherwise, objet is an array, a realm list, or a realm results
    // object, so just slice it to make sure it is a simple array
    const objects = typeof object.objectSchema === 'function' ? [object] : object.slice();

    // If empty, ignore
    if (!objects || objects.length === 0) return;

    // Go through each object, call its destructor, and alert any change listeners
    objects.forEach(obj => {
      const record = { id: obj.id }; // If it is being deleted, only alert with the id
      if (obj && obj.destructor instanceof Function) obj.destructor(this);
      this.alertListeners(CHANGE_TYPES.DELETE, type, record, ...listenerArgs);
    });

    // Actually delete the objects from the database
    this.realm.delete(objects);
  }

  /**
   * Deletes all objects from the database.
   * Any params are passed directly on to change listeners
   * @return {none}
   */
  deleteAll(...listenerArgs) {
    this.realm.deleteAll();
    this.alertListeners(CHANGE_TYPES.WIPE, ...listenerArgs);
  }

  /**
   * Returns all objects of the given type in the database.
   * @param  {string}        type Database object type being queried
   * @return {Realm.Results}      A results object containing all objects of the
   *                              given type.
   */
  objects(type) {
    return this.realm.objects(type);
  }

  /**
   * This method should always be called after a realm object is edited directly
   * by setting properties using dot notation. It is a bit of a hack to make sure
   * listeners are notified of the database update, and will be replaced in future.
   * @param  {string} type       Database object type being updated
   * @param  {object} object     The edited datbase object
   * Any extra params are passed directly on to change listeners
   * @return {none}
   */
  save(type, object, ...listenerArgs) {
    this.alertListeners(CHANGE_TYPES.UPDATE, type, object, ...listenerArgs);
  }

  /**
   * Updates an item already in the database, with the primary key matching
   * that passed in with the properties. If none exists, will create a new
   * object. Also notifies listeners of the database update.
   * @param  {string} type       Database object type being updated
   * @param  {object} properties The new properties for the database object
   * @return {Realm.Object}      The database object that was updated or created
   */
  update(type, properties, ...listenerArgs) {
    const object = this.realm.create(type, properties, true);
    this.alertListeners(CHANGE_TYPES.UPDATE, type, object, ...listenerArgs);
    return object;
  }

  /**
   * Synchronously call the provided callback inside a database write transaction.
   * @param  {function} callback The callback to execute within the transaction
   * @return {none}
   */
  write(callback) {
    this.realm.write(callback);
  }
}
