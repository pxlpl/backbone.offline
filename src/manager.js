Manager = Offline.Singleton.extend({

    relations: [],

    toRecord:function(model){
        var attrs = model.attributes;
        // extend model with default relations
        _.each(this.relations,function(relation){
            if(!relation.relation in attrs){
                attrs[relation.relation]=null;
            }
        });
        return attrs;
    },

    fromRecord:function(record){
          return record;
    },

    read: function(model, options){
        options  = _.defaults(options || {}, {data:{}, success:new Function, error:new Function});
        if (model instanceof Backbone.Model){
            // Backbone.Model
            return this.store.get(model.id)
                .pipe(this.fromRecord)
                .then(options.success, options.error);
        }else{
            // Backbone.Collection
            _.defaults(options.data, {_deleted__exclude:true});
            return this.store.find(options.data)
                .pipe(function(records){
                    return _.map(records, this.fromRecord);
                }.bind(this))
                .pipe(options.success, options.error);
        }

    },

    create: function(model, options){
        options  = _.defaults(options || {}, {success:new Function, error:new Function});
        if (!options.silent){
            model.set('_dirty',true);
            model.set('id',uuid());
        }
        
        var record = this.toRecord(model);

        return this.store.save(record)
            .pipe(this.updateRelated.bind(this,record,{}))
            .pipe(function(){ var dfd = $.Deferred(); dfd.resolve(model, {}, options); return dfd;}) // !!
            .then(options.success, options.error);

    },

    update: function(model, options){
        var self = this;
        var dfd = $.Deferred();
        options  = _.defaults(options || {}, {data:{}, success:new Function, error:new Function});

        if(!options.silent)
            model.set('_dirty',true,{silent:!!options.silent});

        var record = this.toRecord(model);
        this.store.get(model.id)
            .done(function(previous){
                self.updateRelated(record, previous||{})
                    .pipe(self.store.save.bind(self.store,record))
                    .then(options.success, options.error)
                    .done(dfd.resolve);
            })
            .fail(function(){
                options.error();
                dfd.reject();
            });

        return dfd.promise();
    },


    delete: function(model, options){
        options  = _.defaults(options || {}, {success:new Function, error:new Function});
        var dfd = $.Deferred();
        var previous = this.toRecord(model);

        model.set({'_deleted': true}, {silent: true});
        _.each(this.relations, function(relation){
                model.set(relation.relation, null, {silent: true});
        });

        var record = this.toRecord(model);

        this.store.save(record)
            .pipe(function(){
                this.updateRelated(record,previous);
            }.bind(this))
            .then(options.success, options.error)
            .then(dfd.resolve, dfd.reject);

        return dfd;
    },

    updateRelated:function(record,previous){
        var dfd = $.Deferred();
        /*
            hujowo napisana funkcja byle by dzialala
            tak naprawdwe - to docelowo powinno sie notyfikowac powiazane managery, zeby sobie same zmienily relacje
            a nie robic to za nie. bo moze zajsc przypadek:

            A <-> B <->C <->D  (wszystkie FK z obu stron) i teraz dajemy  Z -> C
            wynikiem powinno byc
            A <-> B
            Z <-> C <-> D

            a teraz bedzie:

            A <-> B  -> C <-> D oraz
                  Z <-> C <-> D

         */

        var dfds = _.map(this.relations,function(r){
            var store = Offline.lookup(r.model).store;
            if(r.type=='fk'){

                var prev  = previous[r.relation];
                var fresh = record[r.reverse];
                var x = [];
                if(prev!=fresh){
                    if(prev){
                        x.push(store.update(prev,function(related){
                            related[r.reverse] = null;
                            return related;
                        }));
                    }
                    if(fresh){
                        x.push(store.update(fresh,function(related){
                            related[r.reverse] = record.id;
                            return related;
                        }));
                    }
                    return $.when.apply($,x);
                }else{
                    return undefined;
                }
            }else{
                var add = _.difference(record[r.relation]||[], previous[r.relation]||[]);
                var del = _.difference(previous[r.relation]||[], record[r.relation]||[]);
                return $.when.apply($,_.map(del,function(id){
                    return store.update(id,function(related){
                        related[r.reverse] = _.without(related[r.reverse]||[],record.id);
                        return related;
                    });
                }).concat(_.map(add,function(id){
                    return store.update(id,function(related){
                        related[r.reverse] = _.unique((related[r.reverse]||[]).concat([record.id]));
                        return related;
                    }) ;
                })));
             }

        });
        $.when.apply($,dfds)
            .done(dfd.resolve).fail(dfd.reject);
        return dfd.promise();
    }


});