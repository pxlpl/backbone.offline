describe("synchronizer testing suite", function(){
    async = new AsyncSpec(this);
    

    describe("it can fetch data from remote and local", function(){
        async.beforeEach(connectTestDB);
        async.afterEach(clearTestDB);
        var fakeModel;

        beforeEach(function(){
            spyOn(PizzaStore, "find").andCallThrough();

        });

        beforeEach(function(){
            spyOn(Backbone, "sync").andCallFake(function(method,model,options){
                options.success([{"test": "passed"}]);
                return $.Deferred().resolve();
            });
        });

        async.it("can read a collection from local store", function(done) {
            PizzaSynchronizer.fetchLocalChanges()
                .always(function(){
                    expect(PizzaStore.find).toHaveBeenCalled();
                })
                .done(function(){
                    expect(PizzaStore.find.mostRecentCall.args[0]["_dirty"]).toBe(true);
                })
                .always(done);
        });
        
        async.it("can read a collection from the API", function(done) {

            PizzaSynchronizer.fetchRemoteChanges()
                .done(function(records){
                    expect(records).toEqual([{test: "passed"}]);
                    done();
                });
        });
    });

    describe("it can do CRUD operations", function(){

        beforeEach(function(){
            spyOn(Backbone, "sync").andCallFake(function(method,model,options){
                if (method == "create"){
                    model.attributes.id = 58;
                    options.success(model.attributes);
                    return $.Deferred().resolve();
                }

                if (method == "update"){
                    model.attributes._test_updated = true;
                    return $.Deferred().resolve();   
                }
               if (method == "delete"){
                    // todo - ???
                    return $.Deferred().resolve();   
                }
                 
            });
        });

        async.it("can create records on the remote server", function(done){
            var record = {id: uuid(), name: "asd"};
            PizzaSynchronizer.createRecord(record)
                .done(function(message){
                    // identity test - input record !== output record
                    expect(record).not.toBe(message.record);

                    expect(message.record.id).toEqual(jasmine.any(Number));
                    expect(message.message).toEqual("success");
                    done();
                });
            
        });

        async.it("can update records on the remote server", function(done){
            var record = {id: 42, name: "asd"};
            PizzaSynchronizer.updateRecord(record)
                .done(function(message){
                    expect(record).not.toBe(message.record);

                    expect(message.record.id).toEqual(42);
                    expect(message.record._test_updated).toBe(true);
                    done();
                });
        });

        async.it("can delete records on the remote server", function(done){
            spyOn(PizzaStore, "delete").andCallThrough();
            var record = {id: 43, name: "asd"};

            PizzaSynchronizer.deleteRecord(record)
                .done(function(message){
                    expect(PizzaStore.delete).toHaveBeenCalledWith(43);
                    done();
                });
        });
    });

    describe("helpers unit tests", function(){
        it("can strip and unstrip related objects that don't have a PK yet", function(){
            spyOn(PizzaSynchronizer, "isLocal").andCallFake(_.isString);

            var toppings = [uuid(), uuid(), 1, 2];
            var pizza = {toppings: toppings};
            var rejected = PizzaSynchronizer.strip(pizza);

            _.each(pizza.toppings, function(toppingID){
                expect(toppings).toContain(toppingID);
                expect(toppingID).toEqual(jasmine.any(Number));
            });

            _.each(rejected.toppings, function(toppingID){
                expect(toppings).toContain(toppingID);
                expect(toppingID).not.toEqual(jasmine.any(Number));
            });
            expect(toppings.sort()).toEqual((pizza.toppings.concat(rejected.toppings)).sort());
            
            var unstripped = PizzaSynchronizer.unstrip(pizza, rejected);
            expect(toppings.sort()).toEqual(pizza.toppings.sort());
        });


        it("can read a global map of UUIDs to true IDs", function(){
            var toppingID = uuid();
            var pizza = {toppings: [toppingID]};
            Offline.map[toppingID] = 42;

            pizza = PizzaSynchronizer.resolveRelations(pizza);
            expect(pizza.toppings).toEqual([42]);
        });

        async.it("can update in-store relations on a given list of its own models", function(done){
            var toppingID = uuid();
            Offline.map[toppingID] = 1000;
            PizzaStore.saveMany([
                {id: 1, toppings: [toppingID, 2]}
            ]).pipe(function(){
                return PizzaSynchronizer.replaceUUIDsWithRealIDs([1]);
            }).done(function(){
                PizzaStore.get(1).done(function(record){
                    expect(record.toppings.sort()).toEqual([1000, 2]);
                    done();    
                })
            });
        });

        async.it("can update the in-store version of its model with the given diff", function(done){
            var diff = {
                1: {
                    "toppings": {
                        "add": [1000],
                        "del": [1]
                    }
                }
            };

            PizzaStore.saveMany([
                {id: 1, toppings: [1, 2]}
            ]).pipe(function(){
                return PizzaSynchronizer.applyDiff(diff);
            }).done(function(){
                PizzaStore.get(1).done(function(record){
                    expect(record.toppings.sort()).toEqual([1000, 2]);
                    done();    
                })
            });
        });

        it("can compute a diff between two versions of a record", function(){
            var record, previous;
            record = {
                id: 42,
                toppings: [1, 2, 3]
            };
            previous = {
                toppings: [2, 3, 4]
            };
            var diff = PizzaSynchronizer.diffRecord(record, previous);
            var expected = {
                toppings: {
                    "1": {
                        pizzas: {
                            add: [record.id],
                            del: []
                        }
                    },
                    "4": {
                        pizzas:{
                            add: [],
                            del: [record.id]
                        }
                    }
                }
            };
            expect(diff).toEqual(expected);
        });

        it("can diff lists of records", function(){
            spyOn(PizzaSynchronizer, "diffRecord");

            var records = [{id: 1}, {id: 2}, {id: 3}];
            var previous = [{id: 4}, {id: 3}];
            var diff = PizzaSynchronizer.diffRecords(records, previous);

            var expected = [[1, undefined], [2, undefined], [3, 3]];

            var calls = _.map(PizzaSynchronizer.diffRecord.calls, function(call){
                var args = call["args"];
                return [args[0].id, args[1].id];
            });

            expect(expected.sort()).toEqual(calls.sort());
        });

    });

});


describe("Synchronizer Unit Test Suite",function(){
    var synchronizer = PizzaSynchronizer;
    var async = new AsyncSpec(this);
    var fakeDeferred = function(){
        var dfd = $.Deferred();
            // ugly hack
            _.defer(dfd.resolve);
        return dfd.promise()
    };
    async.beforeEach(connectTestDB);
    async.afterEach(clearTestDB);
    var clone = function(obj){
        var data = {};
        _.each(obj,function(v,k){
            data[k]= _.clone(v);
        });
        return data;
    };

    var record;
    async.beforeEach(function(done){
        record = {id:Offline.uuid(),toppings:[1,2,3,Offline.uuid()]};

        done();
    });

        describe("BUG async behaviour (?)",function(){
            it('methods can not return resolved promises (this is a bug)',function(){
                spyOn(PizzaModel.prototype,'save').andCallFake(fakeDeferred);
                spyOn(PizzaModel.prototype,'destroy').andCallFake(fakeDeferred);
                spyOn(PizzaStore,'save').andCallFake(fakeDeferred);
                spyOn(PizzaStore,'delete').andCallFake(fakeDeferred);
                expect(synchronizer.createRecord({}).state()).toEqual('pending');
                expect(synchronizer.updateRecord({}).state()).toEqual('pending');
                expect(synchronizer.deleteRecord({}).state()).toEqual('pending');
            });
        });


        describe("createRecord",function(){
            // since jasmine does not make copy of mutable arguments, I have to write
            // clone function myself, to copy args

            async.it("calls model.save({},{remote:true})",function(done){
                spyOn(PizzaModel.prototype,'save').andCallFake(fakeDeferred);
                synchronizer.createRecord(record).done(function(){
                    expect(PizzaModel.prototype.save).toHaveBeenCalled();
                    expect(PizzaModel.prototype.save.calls.length).toEqual(1);
                    expect(PizzaModel.prototype.save.mostRecentCall.args[1].remote).toBeTruthy();
                    done();
                });
            });

            async.it("calls strip with record",function(done){
                var args = {};
                spyOn(PizzaModel.prototype,'save').andCallFake(fakeDeferred);
                spyOn(synchronizer,'strip').andCallFake(function(record){
                    args = clone(record);
                    return Synchronizer.strip(record);
                });

                synchronizer.createRecord(clone(record)).done(function(){
                    expect(args).toEqual(record);
                    done();
                });
            });

            async.it("calls unstrip with stripped record and stripped values",function(done){
                // this gets changed 'in-place' by strip()
                var strippedRecord = clone(record);
                var strippedValues = synchronizer.strip(strippedRecord);

                var args = [];
                spyOn(PizzaModel.prototype,'save').andCallFake(fakeDeferred);
                spyOn(synchronizer,'unstrip').andCallFake(function(record,stripped){
                    args[0]=clone(record);
                    args[1]=clone(stripped);
                    return Synchronizer.unstrip(record,stripped)
                });
                synchronizer.createRecord(clone(record)).done(function(){
                    expect(args[0]).toEqual(strippedRecord);
                    expect(args[1]).toEqual(strippedValues);
                    done();
                });
            });

            async.it("calls model.save with stripped record",function(done){
                // this gets changed 'in-place' by strip()
                var strippedRecord = clone(record);
                var strippedValues = synchronizer.strip(strippedRecord);

                var attributes;

                spyOn(PizzaModel.prototype,'save').andCallFake(function(){
                    attributes = clone(this.attributes);
                    return fakeDeferred();
                });


                synchronizer.createRecord(clone(record)).done(function(){
                    expect(attributes).toEqual(strippedRecord);
                    done();
                });
            });


            async.it('resolves with success message when remote success',function(done){
                spyOn(PizzaModel.prototype,'save').andCallFake(fakeDeferred);

                synchronizer.createRecord(clone(record)).done(function(message){
                    expect(message.message).toEqual('success');
//                    expect(message.record).toEqual(record);
                    done();
                });
            });

            async.it('resolves with success message & update info when relations stripped',function(done){
                spyOn(PizzaModel.prototype,'save').andCallFake(fakeDeferred);
                synchronizer.createRecord(clone(record)).done(function(message){
                    expect(message.message).toEqual('success');
                    expect(message.update).toBeTruthy();
                    done();
                });
            });

            async.it('resolves with success message & no update info when no relations stripped',function(done){
                spyOn(PizzaModel.prototype,'save').andCallFake(fakeDeferred);
                var record = {id:Offline.uuid(),secret:Offline.uuid()};
                synchronizer.createRecord(record).done(function(message){
                    expect(message.message).toEqual('success');
                    expect(message.update).not.toBeTruthy();
                    done();
                });
            });
            async.it('resolves with error message when remote error',function(done){
                spyOn(PizzaModel.prototype,'save').andCallFake(function(){
                    return $.Deferred().reject().promise();
                });

                synchronizer.createRecord(clone(record)).done(function(message){
                    expect(message.message).toEqual('error');
//                    expect(message.record).toEqual(record);
                    done();
                });
            });

            async.it('resolves with fatal message when store error',function(done){
                spyOn(PizzaModel.prototype,'save').andCallFake(fakeDeferred);
                spyOn(PizzaStore,'save').andCallFake(function(){
                    return $.Deferred().reject().promise();
                });

                synchronizer.createRecord(clone(record)).done(function(message){
                    expect(message.message).toEqual('fatal');
//                    expect(message.record).toEqual(record);
                    done();
                });
            });
        });

    describe("updateRecord",function(){
        async.it('resolves with success message when remote success',function(done){
            spyOn(PizzaModel.prototype,'save').andCallFake(fakeDeferred);

            synchronizer.updateRecord(clone(record)).done(function(message){
                expect(message.message).toEqual('success');
//                    expect(message.record).toEqual(record);
                done();
            });
        });

        async.it('resolves with error message when remote error',function(done){
            spyOn(PizzaModel.prototype,'save').andCallFake(function(){
                return $.Deferred().reject([{status:500}]).promise();
            });

            synchronizer.updateRecord(clone(record)).done(function(message){

                expect(message.message).toEqual('error');
//                    expect(message.record).toEqual(record);
                done();
            });
        });

        async.it('resolves with fatal message when store error',function(done){
            spyOn(PizzaModel.prototype,'save').andCallFake(fakeDeferred);
            spyOn(PizzaStore,'save').andCallFake(function(){
                return $.Deferred().reject().promise();
            });

            synchronizer.updateRecord(clone(record)).done(function(message){
                expect(message.message).toEqual('fatal');
//                    expect(message.record).toEqual(record);
                done();
            });
        });


        async.it('calls store save after success',function(done){
            spyOn(PizzaStore,'save').andCallFake(fakeDeferred);
            spyOn(PizzaModel.prototype,'save').andCallFake(fakeDeferred);
            synchronizer.updateRecord(clone(record)).done(function(){
                expect(PizzaStore.save).toHaveBeenCalledWith(record);
                done();
            })
        });

    });

    describe('deleteRecord',function(){
        async.it('calls model.destroy with remote:true',function(done){
            spyOn(PizzaModel.prototype,'destroy').andCallFake(fakeDeferred);
            synchronizer.deleteRecord(record).done(function(){
                expect(PizzaModel.prototype.destroy).toHaveBeenCalled();
                expect(PizzaModel.prototype.destroy.mostRecentCall.args[1].remote).toEqual(true);
                done();
            });
        });

        async.it('calls store.delete after success',function(done){
            spyOn(PizzaStore,'delete').andCallFake(fakeDeferred);
            spyOn(PizzaModel.prototype,'destroy').andCallFake(fakeDeferred);

            synchronizer.deleteRecord(record).done(function(){
                expect(PizzaStore.delete).toHaveBeenCalledWith(record.id);
                done();
            });
        });

        async.it('resolves with success message when remote success',function(done){
            spyOn(PizzaModel.prototype,'destroy').andCallFake(fakeDeferred);

            synchronizer.deleteRecord(clone(record)).done(function(message){
                expect(message.message).toEqual('success');
//                    expect(message.record).toEqual(record);
                done();
            });
        });

        async.it('resolves with error message when remote error',function(done){
            spyOn(PizzaModel.prototype,'destroy').andCallFake(function(){
                return $.Deferred().reject([{status:500}]).promise();
            });

            synchronizer.deleteRecord(clone(record)).done(function(message){

                expect(message.message).toEqual('error');
//                    expect(message.record).toEqual(record);
                done();
            });
        });

        async.it('resolves with fatal message when store error',function(done){
            spyOn(PizzaModel.prototype,'destroy').andCallFake(fakeDeferred);

            spyOn(PizzaStore,'delete').andCallFake(function(){
                return $.Deferred().reject().promise();
            });

            synchronizer.deleteRecord(clone(record)).done(function(message){
                expect(message.message).toEqual('fatal');
//                    expect(message.record).toEqual(record);
                done();
            });
        });
    });

    describe("strip",function(){
        it("strips M2M local relations",function(){
            var stripped = synchronizer.strip(record);
            expect(_.map(record.toppings,synchronizer.isLocal)).not.toContain(true);
            expect(_.map(stripped.toppings,synchronizer.isLocal)).not.toContain(false);
        });

        it("strips O2O local relations",function(){
           // Todo
        });
    });

    describe("unstrip",function(){
        it("unstrips M2M relations",function(){
            var stripped = {
                toppings:[Offline.uuid(),Offline.uuid()]
            };
            var record = {};
            synchronizer.unstrip(record,stripped);
            expect(record.toppings).toEqual(stripped.toppings);
        });

        it("unstrips O2O relations",function(){
            // Todo
        })
    });


    describe("resolveRelations",function(){
        // Todo
    });

    describe("createRecords",function(){


        async.it('calls createRecord for each record',function(done){
            var records = [Offline.uuid(),2,3,4,5];
            spyOn(synchronizer,'createRecord').andCallFake(fakeDeferred);
            synchronizer.createRecords(records).done(function(){
                expect(synchronizer.createRecord.calls.length).toEqual(5);
                expect(_.flatten(synchronizer.createRecord.argsForCall)).toEqual(records);
                done();
            });
        });
        async.it('notifies with message after each createRecord',function(done){
            // we want to test this with async behaviour, so we must test
            // with 0 records, with 1 record & with multiple records

            spyOn(synchronizer,'createRecord').andCallFake(function(record){
                var dfd = $.Deferred();
                // this is connected to buggy behaviour of progress
                _.defer(function(){dfd.resolve({message:'success','record':record})});
                return dfd.promise();
            });

            var test = function(records){
                var created = [];
                return synchronizer.createRecords(records).progress(function(message){
                    expect(created).not.toContain(message.record);
                    created.push(message.record);
                }).done(function(){
                   expect(created).toEqual(records);
                });
            };
            $.when(test([]),test([1]),test([1,2,3])).done(done);
        });

        // Todo
    });

    describe("updateRecords",function(){
        // Todo

        async.it('notifies with message after each updateRecord',function(done){
            // we want to test this with async behaviour, so we must test
            // with 0 records, with 1 record & with multiple records

            spyOn(synchronizer,'updateRecord').andCallFake(function(record){
                var dfd = $.Deferred();
                // this is connected to buggy behaviour of progress
                _.defer(function(){dfd.resolve({message:'success','record':record})});
                return dfd.promise();
            });

            var test = function(records){
                var updated = [];
                return synchronizer.updateRecords(records).progress(function(message){
                    expect(updated).not.toContain(message.record);
                    updated.push(message.record);
                }).done(function(){
                        expect(updated).toEqual(records);
                    });
            };
            $.when(test([]),test([1]),test([1,2,3])).done(done);
        });
    });

    describe("deleteRecords",function(){
        // Todo
        async.it('notifies with message after each deleteRecord',function(done){
            // we want to test this with async behaviour, so we must test
            // with 0 records, with 1 record & with multiple records

            spyOn(synchronizer,'deleteRecord').andCallFake(function(record){
                var dfd = $.Deferred();
                // this is connected to buggy behaviour of progress
                _.defer(function(){dfd.resolve({message:'success','record':record})});
                return dfd.promise();
            });

            var test = function(records){
                var deleted = [];
                return synchronizer.deleteRecords(records).progress(function(message){
                    expect(deleted).not.toContain(message.record);
                    deleted.push(message.record);
                }).done(function(){
                        expect(deleted).toEqual(records);
                    });
            };
            $.when(test([]),test([1]),test([1,2,3])).done(done);
        });
    })


});