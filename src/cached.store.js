/*
    Since indexedDB is very slow when filtering and fetching multiple records,
    CachedStore provides simple way speed up fetching by caching entire store
    records in memory.

    Note:
        1. Entire store is fetched to memory - increased memory usage
        2. get() always returns data from indexedDB (fast enough)
        3. Not tested.

    TODO: wrap: save(),delete() to update cache
    TODO: handleRelated should also update cache

 */

Backbone.CachedStore = CachedStore = Backbone.Store.extend({
    // on connection, cache all records
    connect:function(onsuccess,onerror){
        var self = this;
        onsuccess = _.wrap(onsuccess|| new Function,function(func){
            func.apply(null,_.rest(arguments));
            self.find({success:function(records){
                self.cached=records;
            }})
        });
        a = this;
        return CachedStore.super.connect.call(this,onsuccess,onerror)
    },

    // return results from cache
    find:function(options){
        if(!this.cached){
            // TODO: wait for cache to be ready - much faster than sequential search
            // if cache not ready preform regular search
            return CachedStore.super.find.call(this,options);
        }
        var dfd = $.Deferred();

        options     = _.defaults(options || {}, {data: {}, success: new Function, error: new Function});

        var data    = options.data,
            query   = new this.query(data),
            order   = data.order,
            limit   = data.limit || Infinity,
            offset  = data.offset || 0,
            records = [];


        for(var i=0;i<this.cached.length;i++){
            if(records.length>=limit+offset){
                break;
            }
            if(query.matches(this.cached[i])){
                records.push(this.cached[i])
            }
        }
        options.success(records);

        return dfd;
    }

});

