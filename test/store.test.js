describe("Testing async Store behaviour", function(){
    var store = PizzaStore;

    var async = new AsyncSpec(this);

    async.beforeEach(connectTestDB);
    async.afterEach(clearTestDB);

    it("Returns an unresolved Deferred from each public method", function(){    
        var methods = [store.get(1), store.save({id: 1}), store.saveMany([{id:1}]), store.update(42, new Function)]
        _.each(methods, function(maybeDFD){
            expect(maybeDFD.state()).toEqual("pending");
        });      
    });
});


describe("Store test suite",function(){
    var store = PizzaStore;
    var async = new AsyncSpec(this);
    var record = {id:1,secret:Offline.uuid()};

    async.beforeEach(connectTestDB);
    async.afterEach(clearTestDB);

    describe("save test suite",function(){
        async.it("calls store.encode with record",function(done){
            spyOn(store,'encode').andCallThrough();
            store.save(record).done(function(){
                expect(store.encode).toHaveBeenCalledWith(record);
                store.get(record.id).done(function(result){
                    expect(record).toEqual(result);
                    done();
                });
            });
        });
    });

    describe("update test suite",function(){
        var newSecret = Offline.uuid();
        var transformator = function(record){
            record.secret = newSecret;
            return record;
        };
        var expected = _.extend(_.clone(record),{secret:newSecret});


        async.it("calls encode and decode",function(done){
            store.save(record).done(function(){
                // we must have some data in the store
                spyOn(store,'encode').andCallThrough();
                spyOn(store,'decode').andCallThrough();
                store.update(record.id,transformator).done(function(){
                    expect(store.encode).toHaveBeenCalledWith(expected);
                    expect(store.decode).toHaveBeenCalledWith(record);
                    done();
                });
            });
        });

        async.it("calls transformator and saves transformed value",function(done){
            store.save(record).done(function(){
                store.update(record.id,transformator).done(function(){
                    store.get(record.id).done(function(record){
                        expect(record).toEqual(expected);
                        done();
                    })
                })
            });
        });
    });

    describe("delete test suite",function(){
        async.it('get() rejects',function(done){
            store.save(record).done(function(){
                store.delete(record.id).done(function(){
                    var dfd = store.get(record.id).always(function(){
                        expect(dfd.state()).toEqual('rejected');
                        done();
                    })
                });
            });
        });
        async.it('find() does not show deleted record',function(done){
            store.save(record).done(function(){
                store.delete(record.id).done(function(){
                    store.find().done(function(records){
                        expect(records).toEqual([]);
                        done();
                    })
                });
            });
        });
    });

    describe("find test suite",function(){
        async.it('resolves with empty array when no records',function(done){
            store.find().done(function(records){
                expect(records).toEqual([]);
                done();
            });
        });
        async.it('returns all records when no options provided',function(done){
            store.save(record).done(function(){
                store.find().done(function(records){
                    expect(records).toEqual([record]);
                    done();
                });
            });
        });
        //async.it('query stuff')
    });

    describe("get test suite",function(){
        async.it("given id, resolves with record",function(done){
           store.save(record).done(function(){
              store.get(record.id).done(function(result){
                  expect(record).toEqual(result);
                  done();
              });
           });
        });

        async.it("rejects for nonexistent record",function(done){
            var dfd = store.get(record.id).fail(function(){
                expect(dfd.state()).toEqual('rejected');
                done();
            });
        });
    });

    describe("clear test suite",function(){
        async.it("removes all records",function(done){
            store.save(record).done(function(){
               store.clear().done(function(){
                   store.find().done(function(records){
                       expect(records).toEqual([]);
                       done();
                   });
               });
            });
        });
    });

});
