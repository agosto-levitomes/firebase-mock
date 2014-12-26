'use strict';

var sinon    = require('sinon');
var expect   = require('chai').use(require('sinon-chai')).expect;
var _        = require('lodash');
var Firebase = require('../../').MockFirebase;

describe('MockFirebase', function () {

  var ref, spy;
  beforeEach(function () {
    ref = new Firebase().child('data');
    ref.set(require('./data.json').data);
    ref.flush();
    spy = sinon.spy();
  });

  describe('#flush', function () {

    it('flushes the queue and returns itself', function () {
      sinon.stub(ref.queue, 'flush');
      expect(ref.flush(10)).to.equal(ref);
      expect(ref.queue.flush).to.have.been.calledWith(10);
    });

  });

  describe('#autoFlush', function () {

    it('enables autoflush with no args', function () {
      ref.autoFlush();
      expect(ref.flushDelay).to.be.true;
    });

    it('can specify a flush delay', function () {
      ref.autoFlush(10);
      expect(ref.flushDelay).to.equal(10);
    });

    it('sets the delay on all children', function () {
      ref.child('key');
      ref.autoFlush(10);
      expect(ref.child('key').flushDelay).to.equal(10);
    });

    it('sets the delay on a parent', function () {
      ref.child('key').autoFlush(10);
      expect(ref.flushDelay).to.equal(10);
    });

    it('returns itself', function () {
      expect(ref.autoFlush()).to.equal(ref);
    });

  });

  describe('#splitQueue', function () {

    it('detaches the flush queue from the parent', function () {
      var child = ref.child('key');
      expect(child.queue).to.equal(ref.queue);
      child.splitQueue();
      expect(child.queue).to.not.equal(ref.queue);
    });

  });

  describe('#joinQueue', function () {

    it('resets to the parent queue', function () {
      var child = ref.child('key');
      child.splitQueue();
      child.joinQueue();
      expect(child.queue).to.equal(ref.queue);
    });

    it('is a noop with no parent', function () {
      ref = ref.root();
      var queue = ref.queue;
      ref.joinQueue();
      expect(ref.queue).to.equal(queue);
    });

  });

  describe('#failNext', function () {

    it('must be called with an Error', function () {
      expect(ref.failNext.bind(ref)).to.throw('"Error"');
    });

  });

  describe('#forceCancel', function () {

    it('calls the cancel callback', function () {
      ref.on('value', _.noop, spy);
      var err = new Error();
      ref.forceCancel(err);
      expect(spy).to.have.been.calledWith(err);
    });

    it('calls the cancel callback on the context', function () {
      var context = {};
      ref.on('value', _.noop, spy, context);
      ref.forceCancel(new Error(), 'value', _.noop, context);
      expect(spy).to.have.been.calledOn(context);
    });

    it('turns off the listener', function () {
      ref.on('value', spy);
      ref.forceCancel(new Error());
      ref.set({});
      ref.flush();
      expect(spy).to.not.have.been.called;
    });

    it('can match an event type', function () {
      var spy2 = sinon.spy();
      ref.on('value', _.noop, spy);
      ref.on('child_added', _.noop, spy2);
      ref.forceCancel(new Error(), 'value');
      expect(spy).to.have.been.called;
      expect(spy2).to.not.have.been.called;
    });

    it('can match a callback', function () {
      var spy2 = sinon.spy();
      ref.on('value', spy);
      ref.on('value', spy2);
      ref.forceCancel(new Error(), 'value', spy);
      ref.set({});
      ref.flush();
      expect(spy2).to.have.been.called;
    });

    it('can match a context', function () {
      var context = {};
      ref.on('value', spy, spy, context);
      ref.on('value', spy);
      var err = new Error();
      ref.forceCancel(err, 'value', spy, context);
      expect(spy)
        .to.have.been.calledOnce
        .and.calledWith(err);
    });

  });

  describe('#fakeEvent', function () {

    it('can trigger a fake value event', function () {
      ref.on('value', spy);
      ref.flush();
      spy.reset();
      var data = {
        foo: 'bar'
      };
      ref.fakeEvent('value', undefined, data);
      expect(spy).to.not.have.been.called;
      ref.flush();
      expect(spy).to.have.been.calledOnce;
      var snapshot = spy.firstCall.args[0];
      expect(snapshot.ref()).to.equal(ref);
      expect(snapshot.val()).to.deep.equal(data);
      expect(snapshot.getPriority()).to.be.null;
    });

    it('can trigger a fake child_added event', function () {
      ref.on('child_added', spy);
      ref.flush();
      spy.reset();
      var data = {
        foo: 'bar'
      };
      ref.fakeEvent('child_added', 'theKey', data, 'prevChild', 1);
      ref.flush();
      expect(spy).to.have.been.calledOnce;
      var snapshot = spy.firstCall.args[0];
      expect(snapshot.ref()).to.equal(ref.child('theKey'));
      expect(spy.firstCall.args[1]).to.equal('prevChild');
      expect(snapshot.getPriority()).to.equal(1);
    });

    it('uses null as the default data', function () {
      ref.on('value', spy);
      ref.flush();
      spy.reset();
      ref.fakeEvent('value');
      ref.flush();
      var snapshot = spy.firstCall.args[0];
      expect(snapshot.val()).to.be.null;
    });

  });

  describe('#child', function () {

    it('requires a path', function () {
      expect(ref.child.bind(ref)).to.throw();
    });

    it('caches children', function () {
      expect(ref.child('foo')).to.equal(ref.child('foo'));
    });

    it('calls child recursively for multi-segment paths', function () {
      var child = ref.child('foo');
      sinon.spy(child, 'child');
      ref.child('foo/bar');
      expect(child.child).to.have.been.calledWith('bar');
    });

    it('can use leading slashes (#23)', function () {
      expect(ref.child('/children').path).to.equal('Mock://data/children');
    });

    it('can use trailing slashes (#23)', function () {
      expect(ref.child('children/').path).to.equal('Mock://data/children');
    });

  });

  describe('#ref', function () {

    it('returns itself', function () {
      expect(ref.ref()).to.equal(ref);
    });

  });

  describe('#set', function () {

    beforeEach(function () {
      ref.autoFlush();
    });

    it('should remove old keys from data', function () {
      ref.set({
        alpha: true,
        bravo: false
      });
      expect(ref.getData().a).to.be.undefined;
    });

    it('should set priorities on children if included in data', function () {
      ref.set({
        a: {
          '.priority': 100,
          '.value': 'a'
        },
        b: {
          '.priority': 200,
          '.value': 'b'
        }
      });
      expect(ref.getData()).to.contain({
        a: 'a',
        b: 'b'
      });
      expect(ref.child('a')).to.have.property('priority', 100);
      expect(ref.child('b')).to.have.property('priority', 200);
    });

    it('should have correct priority in snapshot if added with set', function () {
      ref.on('child_added', spy);
      var previousCallCount = spy.callCount;
      ref.set({
        alphanew: {
          '.priority': 100,
          '.value': 'a'
        }
      });
      expect(spy.callCount).to.equal(previousCallCount + 1);
      var snapshot = spy.lastCall.args[0];
      expect(snapshot.getPriority()).to.equal(100);
    });

    it('should fire child_added events with correct prevChildName', function () {
      ref = new Firebase('Empty://', null).autoFlush();
      ref.set({
        alpha: {
          '.priority': 200,
          foo: 'alpha'
        },
        bravo: {
          '.priority': 300,
          foo: 'bravo'
        },
        charlie: {
          '.priority': 100,
          foo: 'charlie'
        }
      });
      ref.on('child_added', spy);
      expect(spy.callCount).to.equal(3);
      [null, 'charlie', 'alpha'].forEach(function (previous, index) {
        expect(spy.getCall(index).args[1]).to.equal(previous);
      });
    });

    it('should fire child_added events with correct priority', function () {
      var data = {
        alpha: {
          '.priority': 200,
          foo: 'alpha'
        },
        bravo: {
          '.priority': 300,
          foo: 'bravo'
        },
        charlie: {
          '.priority': 100,
          foo: 'charlie'
        }
      };
      ref = new Firebase('Empty://', null).autoFlush();
      ref.set(data);
      ref.on('child_added', spy);
      expect(spy.callCount).to.equal(3);
      for (var i = 0; i < 3; i++) {
        var snapshot = spy.getCall(i).args[0];
        expect(snapshot.getPriority())
          .to.equal(data[snapshot.key()]['.priority']);
      }
    });

    it('should trigger child_removed if child keys are missing', function () {
      ref.on('child_removed', spy);
      var data = ref.getData();
      var keys = Object.keys(data);
      // data must have more than one record to do this test
      expect(keys).to.have.length.above(1);
      // remove one key from data and call set()
      delete data[keys[0]];
      ref.set(data);
      expect(spy).to.have.been.calledOnce;
    });

    it('should change parent from null to object when child is set', function () {
      ref.set(null);
      ref.child('newkey').set({
        foo: 'bar'
      });
      expect(ref.getData()).to.deep.equal({
        newkey: {
          foo: 'bar'
        }
      });
    });

  });

  describe('#setPriority', function () {

    it('should trigger child_moved with correct prevChildName', function () {
      var keys = ref.getKeys();
      ref.on('child_moved', spy);
      ref.child(keys[0]).setPriority(250);
      ref.flush();
      expect(spy).to.have.been.calledOnce;
      expect(spy.firstCall.args[1]).to.equal(keys[keys.length - 1]);
    });

    it('should trigger a callback', function () {
      ref.setPriority(100, spy);
      ref.flush();
      expect(spy).to.have.been.called;
    });

    it('can be called on the root', function () {
      ref.root().setPriority(1);
      ref.flush();
    });

  });

  describe('#setWithPriority', function () {

    it('should pass the priority to #setPriority', function () {
      ref.autoFlush();
      sinon.spy(ref, 'setPriority');
      ref.setWithPriority({}, 250);
      expect(ref.setPriority).to.have.been.calledWith(250);
    });

    it('should pass the data and callback to #set', function () {
      var data = {};
      var callback = sinon.spy();
      ref.autoFlush();
      sinon.spy(ref, 'set');
      ref.setWithPriority(data, 250, callback);
      expect(ref.set).to.have.been.calledWith(data, callback);
    });

  });

  describe('#update', function () {

    it('must be called with an object', function () {
      expect(ref.update).to.throw();
    });

    it('extends the data', function () {
      ref.update({
        foo: 'bar'
      });
      ref.flush();
      expect(ref.getData()).to.have.property('foo', 'bar');
    });

    it('can be called on an empty reference', function () {
      ref.set(null);
      ref.flush();
      ref.update({
        foo: 'bar'
      });
      ref.flush();
      expect(ref.getData()).to.deep.equal({
        foo: 'bar'
      });
    });

    it('can simulate an error', function () {
      var err = new Error();
      ref.failNext('update', err);
      ref.update({
        foo: 'bar'
      }, spy);
      ref.flush();
      expect(spy).to.have.been.calledWith(err);
    });

  });

  describe('#remove', function () {

    it('fires child_removed for children', function () {
      ref.on('child_removed', spy);
      ref.child('a').remove();
      ref.flush();
      expect(spy).to.have.been.called;
      expect(spy.firstCall.args[0].key()).to.equal('a');
    });

    it('changes to null if all children are removed', function () {
      ref.getKeys().forEach(function (key) {
        ref.child(key).remove();
      });
      ref.flush();
      expect(ref.getData()).to.be.null;
    });

    it('can simulate an error', function () {
      var err = new Error();
      ref.failNext('remove', err);
      ref.remove(spy);
      ref.flush();
      expect(spy).to.have.been.calledWith(err);
    });

  });

  describe('#on', function () {

    it('should work when initial value is null', function () {
      ref.on('value', spy);
      ref.flush();
      expect(spy).to.have.been.calledOnce;
      ref.set('foo');
      ref.flush();
      expect(spy).to.have.been.calledTwice;
    });

    it('can take the context as the 3rd argument', function () {
      var context = {};
      ref.on('value', spy, context);
      ref.flush();
      expect(spy).to.have.been.calledOn(context);
    });

    it('can simulate an error', function () {
      var context = {};
      var err = new Error();
      var success = spy;
      var fail = sinon.spy();
      ref.failNext('on', err);
      ref.on('value', success, fail, context);
      ref.flush();
      expect(fail)
        .to.have.been.calledWith(err)
        .and.calledOn(context);
      expect(success).to.not.have.been.called;
    });

    it('can simulate an error', function () {
      var context = {};
      var err = new Error();
      var success = spy;
      var fail = sinon.spy();
      ref.failNext('on', err);
      ref.on('value', success, fail, context);
      ref.flush();
      expect(fail)
        .to.have.been.calledWith(err)
        .and.calledOn(context);
      expect(success).to.not.have.been.called;
    });

    it('is cancelled by an off call before flush', function () {
      ref.on('value', spy);
      ref.on('child_added', spy);
      ref._events.value = [];
      ref._events.child_added = [];
      ref.flush();
      expect(spy).to.not.have.been.called;
    });

  });

  describe('#once', function () {

    it('only fires the listener once', function () {
      ref.once('value', spy);
      ref.flush();
      expect(spy).to.have.been.calledOnce;
      ref.set({});
      ref.flush();
      expect(spy).to.have.been.calledOnce;
    });

    it('can catch a simulated error', function () {
      var cancel = sinon.spy();
      var err = new Error();
      ref.failNext('once', err);
      ref.once('value', spy, cancel);
      ref.flush();
      ref.set({});
      ref.flush();
      expect(cancel).to.have.been.calledWith(err);
      expect(spy).to.not.have.been.called;
    });

    it('can provide a context in place of cancel', function () {
      var context = {};
      ref.once('value', spy, context);
      ref.flush();
      expect(spy).to.have.been.calledOn(context);
    });

  });

  describe('#off', function () {

    it('can disable all events', function () {
      sinon.spy(ref, 'off');
      ref.off();
      expect(ref.off).to.have.been.calledWith('value');
    });

    it('can disable a specific event', function () {
      ref.on('value', spy);
      ref.on('child_added', spy);
      ref.flush();
      spy.reset();
      ref.off('value');
      ref.push({
        foo: 'bar'
      });
      ref.flush();
      expect(spy).to.have.been.calledOnce;
    });

  });

  describe('#transaction', function () {

    it('should call the transaction function', function () {
      ref.transaction(spy);
      ref.flush();
      expect(spy).to.have.been.called;
    });

    it('should fire the callback with a "committed" boolean and error message', function () {
      ref.transaction(function (currentValue) {
        currentValue.transacted = 'yes';
        return currentValue;
      }, function (error, committed, snapshot) {
        expect(error).to.be.null;
        expect(committed).to.be.true;
        expect(snapshot.val().transacted).to.equal('yes');
      });
      ref.flush();
    });

  });

  describe('#push', function () {

    it('can add data by auto id', function () {
      var id = ref._newAutoId();
      sinon.stub(ref, '_newAutoId').returns(id);
      ref.push({
        foo: 'bar'
      });
      ref.flush();
      expect(ref.child(id).getData()).to.deep.equal({
        foo: 'bar'
      });
    });

    it('can simulate an error', function () {
      var err = new Error();
      ref.failNext('push', err);
      ref.push({}, spy);
      ref.flush();
      expect(spy).to.have.been.calledWith(err);
    });

    it('avoids calling set when unnecessary', function () {
      var id = ref._newAutoId();
      sinon.stub(ref, '_newAutoId').returns(id);
      var set = sinon.stub(ref.child(id), 'set');
      ref.push();
      ref.push(null);
      expect(set).to.not.have.been.called;
    });

  });

  describe('#root', function () {

    it('traverses to the top of the reference', function () {
      expect(ref.child('foo/bar').root().path)
        .to.equal('Mock://');
    });

  });
  
});