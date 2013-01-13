var when = $.when.apply.bind($.when, undefined);

var _mergeDiffs = function (diff, patch) {
    if (!patch) {
        return diff;
    }
    if (!diff) {
        return patch;
    }
    _.each(patch, function (obj, id) {
        diff[id] = diff[id] || {};
        _.each(obj, function (change, attribute) {
            var d = diff[id][attribute] = diff[id][attribute] || {};
            if (change['add']) {
                d['add'] = _.union(d['add'] || [], change['add']);
            }
            if (change['del']) {
                d['del'] = _.union(d['del'] || [], change['del']);
            }
            if (change['set']) {
                d['set'] = change['set'];
            }
            if (change['unset']) {
                d['unset'] = change['unset'];
            }
        })
    });
    return diff;
};


var concatDiffs = function (diffA, diffB) {
    var diff = {};
    diffA = diffA || {};
    diffB = diffB || {};
    _.each(_.union(_.keys(diffA), _.keys(diffB)), function (storeName) {
        diff[storeName] = _mergeDiffs(diffA[storeName], diffB[storeName])
    });
    return diff;
};



Synchronizer = Offline.Singleton.extend({
    logLevel: -Infinity,
    relations: [],
    after: [],
    chunk: 1000,

    strip: function (record) {
        /*
            Removes "in-place" relations to local records (UUID), and returns stripped relations
         */
        var rejected = {};
        var self = this;
        var strip;

        var stripList = function (record, attribute) {
            var rejected = _.filter(record[attribute] || [], self.isLocal);
            record[attribute] = _.reject(record[attribute] || [], self.isLocal);
            return rejected;
        };

        var stripFk = function (record, attribute) {
            if (record[attribute] && self.isLocal(record[attribute])) {
                var rejected = record[attribute];
                record[attribute] = null;
                return rejected;
            }
            return null;
        };


        _.each(this.relations || [], function (relation) {
            if (record[relation.relation]) {
                if (relation.type == 'fk') {
                    strip = stripFk;
                } else {
                    strip = stripList;
                }
                rejected[relation.relation] = strip(record, relation.relation);
                if (_.isEmpty(rejected[relation.relation])) {
                    delete rejected[relation.relation];
                }
            }
        });
        return rejected;
    },

    unstrip: function (record, stripped) {
        /*
            Restores "in-place" stripped relations
         */
        var unstripFk = function (record, attribute) {
            record[attribute] = stripped[attribute] || null;
        };
        var unstripList = function (record, attribute) {
            record[attribute] = _.union(stripped[attribute] || [], record[attribute] || []);
        };
        var unstrip;
        _.each(this.relations, function (relation) {
            if (relation.type == 'fk') {
                unstrip = unstripFk;
            } else {
                unstrip = unstripList;
            }
            unstrip(record, relation.relation);
        });

        return record;
    },

    isLocal: function (obj) {
        /*
            returns true if models is only local - not created on the server
         */
        var id = _.isObject(obj) ? obj.id : obj;
        return !_.isNumber(id);
    },

    lastSync: function (time) {
        /*
            sets & returns time of the last successful synchronization
         */
        var key = this.store.name;
        if (time !== undefined) {
            if (time == null) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, time);
            }
        } else {
            time = localStorage.getItem(key);
            return new Date(time || 0);
        }
    },

    fetchLocalChanges: function () {
        /*
            returns changed records since last sync
         */

        var cb = this.benchmark('fetchLocalChanges',3);
        return this.store.find({_dirty: true, _conflicted__exclude: true})
            .done(cb);
    },

    fetchRemoteChanges: function () {
        var dfd = $.Deferred();
        var cb = this.benchmark('fetchRemoteChanges', 3);
        dfd.done(cb);

        var collection = new (Offline.lookup(this).collection)();

        /* notify about lastSync */
        dfd.notify(new Date());

        collection.fetch({
            add: true,
            remote: true,
            data: {
                "updated__gte": this.lastSync().toISOString().slice(0, -1)
            }
        }).done(function () {
                dfd.resolve(_.pluck(collection.models, 'attributes'));
            });

        return dfd.promise();
    },

    createRecords: function (records) {
        /*
            creates records on remote server
            notifies about each operation with message
         */
        var cb = this.benchmark('createRecords',3);
        var self = this;
        var dfd = $.Deferred();
        var dfds = _.map(records, function (record) {
            return self.createRecord(record).done(dfd.notify);
        });
        when(dfds).done(dfd.resolve);
        return dfd.promise().done(cb);
    },

    updateRecords: function (records) {
        /*
            updates records on the server
            notifies about each operation with message
         */
        var cb = this.benchmark('updateRecords',3);
        var self = this;
        var dfd = $.Deferred();
        var dfds = _.map(records, function (record) {
            return self.updateRecord(record).done(dfd.notify);
        });
        when(dfds).done(dfd.resolve);
        return dfd.promise().done(cb);
    },

    deleteRecords: function (records) {
        /*
            deletes records on the remote server
            notifies about each operation with message
         */
        var cb =this.benchmark('deleteRecords',3);
        var self = this;
        var dfd = $.Deferred();
        var dfds = _.map(records, function (record) {
            return self.deleteRecord(record).done(dfd.notify);
        });

        when(dfds).done(dfd.resolve);
        return dfd.promise().done(cb);
    },

    saveRecords: function (records) {
        var dfd = $.Deferred();

        var cb = this.benchmark('saveRecords',3);
        dfd.done(cb);

        this.store.saveMany(records).done(dfd.resolve);

        return dfd.promise();
    },

    deleteRecord: function (record) {
        /*
            deletes record on the remote server
         */
        var cb = this.benchmark('deleteRecord', 5);
        var self = this;
        var model = new self.model(record);
        var dfd = $.Deferred();

        var done = function () {
            self.store.delete(record.id).done(function () {
                dfd.resolve({
                    message: "success",
                    record: record
                });
            }).fail(function () {
                    // the object was deleted on the server, but we could'nt delete id from local Store
                    dfd.resolve({
                        message: "fatal",
                        record: record
                    });
                });
        };

        var fail = function () {
            dfd.resolve({
                message: "error",
                record: record
            });
        };

        model.destroy({}, {remote: true})
            .done(done)
            .fail(fail);

        return dfd.promise().done(cb);
    },

    createRecord: function (record) {
        /*
            creates record on the server

            1. tries to resolve relations with local records (replaces uuid with id if possible)
            2. checks if record has any unresolved relations with local records, and stripes the relations
            3. creates record on the remote server
            4. reverts stripped relations
            5. saves record to local Store
         */

        var cb =this.benchmark('createRecord', 5);
        this.resolveRelations(record);

        var self = this;
        var stripped = this.strip(record);
        var model = new (self.model)(record);
        var uuid = record.id;
        var store = self.store;
        var dfd = $.Deferred();


        var done = function () {
            self.store.delete({id: uuid})
                .fail(function(){
                    dfd.resolve({
                        message: 'fatal',
                        record: record
                    });
                });

            Offline.map[uuid] = model.id;

            record = self.unstrip(model.attributes, stripped);

            store.save(record)
                .done(function () {
                    if (!_.isEmpty(stripped)) {
                        // stripnelismy jakies relacje, zatem trzeba bedzie je
                        // wyslac w drugim kroku - putem
                        dfd.resolve({
                            message: 'success',
                            update: true,
                            record: record
                        });
                    } else {
                        dfd.resolve({
                            message: 'success',
                            record: record
                        });
                    }
                })
                .fail(function () {
                    // zapisalismy do rest ale nie udalo sie zapisac do idb
                    dfd.resolve({
                        message: 'fatal',
                        record: record
                    });

                })

        };

        var fail = function () {
            dfd.resolve({
                message: 'error',
                record: record
            });
        };


        model.save({}, {remote: true})
            .done(done)
            .fail(fail);

        return dfd.promise().done(cb);
    },

    updateRecord: function (record) {
        /*
            updates the record on the server

            1. tries to resolve relations with local records (replaces uuid with id if possible)
            2. updates the record, sends if-unmodified-since header to protect remote changes from overwriting
               freshly created records must have _fresh attribute in order to not send 'if-unmodified-since' header
            3. saves record to local Store

         */
        
        var dfd = $.Deferred();

        var cb = this.benchmark('updateRecord', 5);
        dfd.done(cb);

        var self = this;
        var store = self.store;
        var lastSync = this.lastSync();
        var headers = {};
        var valid;


        this.resolveRelations(record);
        var model = new self.model(record);

        if (record._fresh) {
            delete record["_fresh"];
        } else {
            headers = {"If-Unmodified-Since": lastSync.toISOString().slice(0, -1)}
        }

        var fatal = function () {
                    // the record was updated on the server, but not in the local Store
                    // this is a fatal error (inconsistent state)
                    dfd.resolve({
                        message: "fatal",
                        record: record
                    });
            };

        var done = function () {
            var newRecord = model.attributes;

            store.save(newRecord)
                .done(function () {
                    dfd.resolve({
                        message: "success",
                        record: newRecord
                    })
                })
                .fail(fatal)
        };

        var fail = function (xhr, status, error) {
            var reason;
            if (xhr.status == 412){
                reason = "conflict";    
            }
            if (xhr.status == 500){
                reason = "server error";
            }
            if (xhr.status == 406){
                reason = "invalid";
            }
            _.defer(
                function(){
                    dfd.resolve({
                    message: "error",
                    record: valid,
                    reason: reason
                })
            });

        };

        model.save({}, {remote: true, headers: headers, error:function(model, response){
            valid = model.parse(response);
        }})
            .done(done)
            .fail(fail);

        return dfd.promise();
    },

    resolveRelations: function (record) {
        /*
            tries to replace uuid with id ('in-place')
         */
        var resolveList = function (record, attribute) {
            record[attribute] = _.map(record[attribute] || [], function (id) {
                return Offline.uuid2id(id)
            });
        };

        var resolveFk = function (record, attribute) {
            record[attribute] = Offline.uuid2id(record[attribute]);
        };

        var resolve;
        _.each(this.relations || [], function (relation) {
            if (record[relation.relation]) {
                if (relation.type == 'fk') {
                    resolve = resolveFk;
                } else {
                    resolve = resolveList;
                }
                resolve(record, relation.relation);
            }
        });
        return record;
    },

    replaceUUIDsWithRealIDs: function (ids) {
        /*
            given ids of records to update,
            replaces relations to local records (replaces uuid with id of created records)
         */

        var dfd = $.Deferred();

        var cb = this.benchmark('updateRelations');
        dfd.done(cb);

        var transformator = this.resolveRelations.bind(this);

        dfd.progress(_.after(ids.length, dfd.resolve));

        _.each(ids, function (id) {
            this.store.update(id, transformator)
                .always(dfd.notify)
        }.bind(this));

        return dfd.promise();
    },

    diffRecord: function (record, previous) {
        var diff = {};

        _.each(this.relations, function (r) {
            var relationName = r.relation;
            var reverseName = r.reverse;
            var d = {};

            if (r.type == 'fk' && previous[relationName] != record[relationName]) {
                var change;
                if (previous[relationName]) {
                    change = d[previous[relationName]];
                    change[reverseName] = change[reverseName] || {};
                    change['unset'] = record.id;
                }
                if (record[relationName]) {
                    change = d[record[relationName]];
                    change[reverseName] = change[reverseName] || {};
                    change['set'] = record.id;
                }

            } else {
                var add = _.difference(record[relationName] || [], previous[relationName] || []);
                var del = _.difference(previous[relationName] || [], record[relationName] || []);
                _.each(_.union(add, del), function (id) {
                    d[id] = d[id] || {};
                    d[id][reverseName] = {add: [], del: []};

                    if (_.contains(add, id)) {
                        d[id][reverseName]['add'].push(record.id);
                    } else {
                        d[id][reverseName]['del'].push(record.id);
                    }

                });
            }

            diff[Offline.hash(r.model)] = d;
        });

        return diff;
    },

    diffRecords: function (records, previous) {
        /*
            given two lists of records, compute list of relations Diffs
        */
        var diffs = [];
        var self = this;

        // pair the records, to easily compute diffs between pairs
        var pairs = [];
        _.each(records, function (record) {
            if(self.isLocal(record)){
                // don't generate diffs for local records
                return;
            }
            pairs.push({
                record: record,
                previous: _.find(previous, function (prev) {
                    return prev.id == record.id
                })
            });
        });

        // create empty diffs container
        _.each(self.relations, function (r) {
            diffs[r.relation] = {}
        });

        _.each(pairs, function (pair) {
            var newRecord = pair.record;
            var oldRecord = pair.previous || {};
            diffs = concatDiffs(diffs, self.diffRecord(newRecord, oldRecord));
        });

        return diffs;
    },

    resolveConflicts: function (conflicts) {
        /*
            resolves conflicts (create,update,delete) with 'resolve later' strategy
            
         */
        var dfd = $.Deferred();

        var cb = this.benchmark('resolveConflicts',3);
        dfd.done(cb);
        
        var self = this;
        var total = conflicts.update.length + conflicts.create.length + conflicts.delete.length;
        dfd.progress(_.after(total, dfd.resolve));

        _.each(conflicts.create, function (record) {
            var transformator = function (record) {
                record._conflicted = true;
                return record;
            };
            self.store.update(record.id, transformator)
                .always(dfd.notify);
        });

        _.each(conflicts.delete, function (record) {
            var transformator = function (record) {
                record._conflicted = true;
                return record;
            };
            self.store.update(record.id, transformator)
                .always(dfd.notify);
        });

        _.each(conflicts.update, function (record) {
            var transformator = function (conflicted) {
                conflicted.type = self.store.name;
                ConflictsStore.save(conflicted);
                record._conflicted = true;
                return record;
            };
            self.store.update(record.id, transformator).always(dfd.notify);
        });

        return dfd.promise()
    },


    applyDiff: function (diff) {
        /*
            applies changes from the diff
            diff to obiekt postaci {relationName: {add: [1,2], del: [3,4]}}
        */
        var dfd = $.Deferred();

        var cb = this.benchmark('applyDiff', 4);
        dfd.done(cb);

        dfd.progress(_.after(_.keys(diff).length, dfd.resolve));

        _.each(diff, function (d, id) {
            var transformator = function (record) {
                _.each(d, function (change, relation) {
                    if (change['add'] || change['del']) {
                        record[relation] = _.union(record[relation] || [], change['add']);
                        record[relation] = _.without.apply(this, [record[relation]].concat(change['del'] || []));
                    } else if (change['set'] || change['unset']) {
                        if (change['set']) {
                            record[relation] = change['set']
                        } else if (record[relation] == change['unset']) {
                            record[relation] = null;
                        }
                    }
                });
                return record;
            };
            this.store.update(parseInt(id), transformator).always(dfd.notify);
        }.bind(this));

        return dfd.promise();
    }

});

/* utils */
Synchronizer.log = function () {
    var s = '                    #';
    s = this.store.name + s.slice(this.store.name.length, s.length);
    var args = [s.toUpperCase()].concat(_.toArray(arguments));
    console.log.apply(console, args);
};

Synchronizer.benchmark = function (name, level) {
    if ((level || 0) > this.logLevel) {
        return new Function();
    }
    var cid = _.uniqueId(name+' : ');
    // string formatting
    var s = '                                              #';
    var f = '                                ';
    var t = cid ;
    var h = Offline.hash(this);
    s = h + s.slice(h.length, s.length);
    f = t + f.slice(t.length, f.length);
    s = s.toUpperCase() + f;

    // begin timing
    console.time(s);
    // return callback function
    return function(){
        console.timeEnd(s);
    }
};
/* end of utils */