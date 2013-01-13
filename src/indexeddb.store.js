IndexedDBStore = Offline.Singleton.extend({
    // query hanlder
    query: Backbone.Query,
    recordsStore: 'records',
    queue: [],
    db: null,
    dfd: null,

    // Public: how should we encode record
    // (for instance, localStorage needs a to store a valid string
    // and IndexedDB does not accept Boolean indexes)
    encode: function(data){
        var record = _.clone(data);
        if(record._dirty){
            record._dirty=1;
        }
        return record;
    },

    // Public: reverse encoded record got from store
    // (for instance localStorage returns string & we need to parse
    // Date representation to back to Date object. )
    decode: function(record){
        if('_dirty' in record){
            record._dirty=!!record._dirty;
        }
        return record;
    },

    // Public: initializer
    initialize: function(){
        this.dfd = $.Deferred();
        var wrap = this.wrap;
        _.each(['get','save','delete','find'],function(method){
            this[method]=wrap(this[method])
        }.bind(this));
    },

    // Public: connecting to db
    connect: function(onsuccess,onerror){
        this.initialize();
        var request = window.indexedDB.open(this.name, this.version || 2);
        request.onupgradeneeded = this.upgrade.bind(this);
        request.onsuccess = function(event){
            this.db = event.target.result;
            (onsuccess || new Function)(event);
            this.dfd.resolve();
        }.bind(this);

        request.onerror = function(event){
            (onerror || new Function)(event);
            this.dfd.reject();
        }.bind(this);

        return this.dfd;
    },

    // Public: disconnecting to db
    disconnect:function(){
        this.db.close();
    },

    // Public: upgrading from older version of store
    upgrade:function(event){
        var db = event.target.result;
        var store;

        store = db.createObjectStore(this.recordsStore, {keyPath: 'id'});
        store.createIndex("dirty","_dirty",{ unique: false })

    },

    // Private: function wrapper that ques functions until db is ready
    wrap : function(func){
        var queue = function(){
            var args = _.toArray(arguments);
            var func = args.shift();
            // w kolejce przyklejamy po prostu kolejne funkcje do this.dfd,
            // ktory zostanie odpalony w connect
            if (!this.db){
                this.dfd.pipe(function(){
                    return func.apply(this, args);
                }.bind(this));
                return this.dfd;

            } else {
                return func.apply(this, args);
            }
        }
        return _.wrap(func, queue);
    },

    // Public: returns model attribute
    get: function(id){
        var dfd = $.Deferred();

        var request = this.db.transaction(this.recordsStore, 'readonly').objectStore(this.recordsStore).get(id);

        request.onsuccess = function(event){
            var record = event.target.result;
            if (_.isUndefined(record)){
                dfd.reject();
            } else {
                record = this.decode(record);
                dfd.resolve(record);
            }
        }.bind(this);

        request.onerror = function(event){
            dfd.reject(event);
        };

        return dfd.promise();
    },

    // Public: saves model to db
    save: function(record){
        var dfd = $.Deferred();

        record = this.encode(record);

        var transaction = this.db.transaction(this.recordsStore, 'readwrite');
        var request = transaction.objectStore(this.recordsStore).put(record);

        request.onsuccess = function(event){
            _.defer(dfd.resolve);
        };

        request.onerror = function(){
            console.log(event);
            dfd.reject();
        };
        return dfd.promise();

    },
    saveMany: function(records){
        var dfd = $.Deferred();

        dfd.progress(_.after(records.length, _.defer.bind(null, dfd.resolve)));
        var transaction = this.db.transaction(this.recordsStore, 'readwrite');

        _.each(records, function(record){
            if (record instanceof Backbone.Model){
                record = this.encode(record);
            }
            var request = transaction.objectStore(this.recordsStore).put(record);

            request.onsuccess = function(event){
                dfd.notify();
            };

            request.onerror = function(){
                dfd.notify();
            };
        }.bind(this));

        return dfd.promise();

    },
    // Public: removes model from db
    delete:function(record){
        var id = record;
        if(_.isObject(record)){
            id=record.id;
        }
        var dfd = $.Deferred();
        var transaction = this.db.transaction(this.recordsStore, 'readwrite');
        var request = transaction.objectStore(this.recordsStore).delete(id);

        request.onsuccess = function(event){
            _.defer(dfd.resolve);
        };

        request.onerror = function(){
            dfd.reject();
        };
        return dfd.promise();

    },

    // Public: find models matching query (fetch())
    find: function(data){
        var dfd = $.Deferred();

        data = data || {};

        var query   = new this.query(data),
            order   = data.order,
            limit   = data.limit || Infinity,
            offset  = data.offset || 0,
            records = [];

        var request = this.db.transaction(this.recordsStore, 'readonly').objectStore(this.recordsStore);
        if(data._dirty){
            request = request.index('dirty').openCursor(IDBKeyRange.only(1));
        }else{
            request = request.openCursor();
        }
        // ta funkcja bedzie odpalana dla kazdej wartosci pod kursorem, jej zadaniem
        // jest dodanie do records[] matchujacych rekordow
        request.onsuccess = function(event){
            var cursor = event.target.result;
            if (cursor && records.length < limit + offset) {
                var record = this.decode(cursor.value);
                if (query.matches(record)){
                    records.push(record);
                }
                cursor.continue();
            } else {
                records = records.splice(offset, records.length - offset);
                dfd.resolve(records);
            }
        }.bind(this);

        request.onerror = function(event){
            dfd.fail(event);
        };

        return dfd.promise();
    },

    // Public: clears the store from models and changes
    clear: function(){
        var dfd = $.Deferred();
        var stores = [this.recordsStore],
            transaction = this.db.transaction(stores, 'readwrite');

        // sukces bedzie dopiero po 2 razach, bo mamy 2 store a przypisujemy te fkcje
        // na sukces dla obu
        var onsuccess = function (){
//            console.log('Store ' + this.name + ' cleared');
            _.defer(dfd.resolve);
        }.bind(this);

        var onerror = function (){
            console.log('Error while clearing store' + this.name);
            _.defer(dfd.reject);
        }.bind(this);


        _.each(stores, function(storeName){
            var clearTransaction = transaction.objectStore(storeName).clear();
            clearTransaction.onsuccess = onsuccess;
            clearTransaction.onerror = onerror;
        });

        return dfd;
    },

    // Internal: updates record, transformator function is passed record, result of the transformator is the updated value
    update: function(id, transformator){

        var dfd = $.Deferred();
        var os = this.db.transaction(this.recordsStore,'readwrite').objectStore(this.recordsStore);
        var get = os.get(id);
        get.onsuccess = function(e){
            var record = e.target.result;
            if (record){
                record = this.decode(record);
                record = this.encode(transformator(_.clone(record)));
                var request = os.put(record);
                request.onsuccess=function(){
                    _.defer(dfd.resolve);
                    // warning: trzeba zakonczyc transakcje zeby to sie zapisalo
                };
                request.onerror=function(){

                }
            }else{
                _.defer(dfd.resolve);
            }
        }.bind(this);

        get.onerror = function(e){
            console.log("UPDATE ERROR");
            dfd.reject();
        };
        return dfd.promise();
    }

});