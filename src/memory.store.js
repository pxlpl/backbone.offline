MemoryStore = Offline.Singleton.extend({

    encode:function(data){
        return data;
    },
    decode:function(data){
        return data;
    },
    connect: function(){
        this.store = {};
        return $.Deferred().resolve();
    },

    clear: function(){
        this.store = {};
        return $.Deferred().resolve();
    },

    save: function(record){
        var dfd = $.Deferred();

        this.store[record.id] = this.encode(_.clone(record));

        // _.defer zeby MemoryStore dzialal "asynchronicznie" - tak, jak prawdziwy store
        // to jest potrzebne, zeby .progress i .done w Synchronizerze odpalaly sie po kolei
        _.defer(function(){dfd.resolve()});
        return dfd.promise();
    },

    get: function(id){

        var dfd = $.Deferred();
        var record = this.decode(_.clone(this.store[id]));
        if (record){
            _.defer(function(){dfd.resolve(record);});
        } else {
            _.defer(function(){dfd.reject();});
        }


        return dfd.promise();
    },

    update: function(id, transformator){
        var dfd = $.Deferred();
        var record = this.decode(this.store[id]);
        record = transformator(_.clone(record));
        this.store[id] = this.encode(record);
        _.defer(function(){dfd.resolve();});
        return dfd.promise();
    },

    find: function(data){
        var dfd = $.Deferred();
        data = data || {};
        var query   = new this.query(data),
            order   = data.order,
            limit   = data.limit || Infinity,
            offset  = data.offset || 0;

        var counter = 0;
        var results = _.filter(this.store, function(obj, key){
            if (query.matches(obj) && counter < limit + offset){
                counter = counter + 1;
                return true;
            }
        });

        results = _.map(results, _.clone);
        results = _.map(results, this.decode);
        _.defer(function(){dfd.resolve(results);});

        return dfd.promise();
    },


    saveMany: function(records){
        var dfd = $.Deferred();

        dfd.progress(_.after(records.length, dfd.resolve));

        _.each(records, function(record){
            this.save(this.encode(record)).always(dfd.notify);
        }.bind(this));

        return dfd.promise();
    },

    delete: function(id){
        if(_.isObject(id)){
            id=id.id;
        }
        var dfd = $.Deferred();
        delete this.store[id];
        _.defer(function(){dfd.resolve();});
        return dfd.promise();
    },

    query: Backbone.Query

});