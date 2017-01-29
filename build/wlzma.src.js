/*
Copyright (c) 2017 Marcel Greter (http://github.com/mgreter)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

var LZMA = LZMA || {};

(function (LZMA) {

	// very simple in memory input stream class
	LZMA.iStream = function(buffer)
	{
		// create byte array view of buffer
		this.array = new Uint8Array(buffer);
		// convenience status member
		this.size = buffer.byteLength;
		// position pointer
		this.offset = 0;
	}

	// simply return the next byte from memory
	LZMA.iStream.prototype.readByte = function()
	{
		// advance pointer and return byte
		return this.array[this.offset++];
	}

	// output stream constructor
	LZMA.oStream = function(buffers)
	{
		// aggregated size
		this.size = 0;
		// initialize empty
		this.buffers = [];
		buffers = buffers || [];
		// make sure size matches data
		for (var i = 0, L = buffers.length; i < L; i++) {
			// unwrap nested output streams
			if (buffers[i] instanceof LZMA.oStream) {
				var oBuffers = buffers[i].buffers;
				for (var n = 0; n < oBuffers.length; n++) {
					this.buffers.push(buffers[i].buffers[n]);
					this.size += buffers[i].buffers[n].length;
				}
			} else {
				// simply append the one buffer
				this.buffers.push(buffers[i]);
				this.size += buffers[i].length;
			}
		}
	}

	// we expect a Uint8Array buffer and the size to read from
	// creates a copy of the buffer as needed so you can re-use it
	// tests with js-lzma have shown that this is at most for 16MB
	LZMA.oStream.prototype.writeBytes = function writeBytes(buffer, size)
	{
		// can we just take the full buffer?
		// or just some part of the buffer?
		if (size <= buffer.byteLength) {
			// we need to make a copy, as the original
			// buffer will be re-used. No way around!
			this.buffers.push(buffer.slice(0, size));
		}
		// assertion for out of boundary access
		else { throw Error("Buffer too small?"); }
		// increase counter
		this.size += size;
	}

	// return a continous Uint8Array with the full content
	// the typed array is guaranteed to have to correct length
	// also meaning that there is no space remaining to add more
	// you may should expect malloc errors if size gets a few 10MB
	// calling this repeatedly always returns the same array instance
	LZMA.oStream.prototype.toUint8Array = function toUint8Array()
	{
		// local variable access
		var size = this.size,
			buffers = this.buffers;

		// the simple case with only one buffer
		if (buffers.length == 1) {
			// make a copy if needed!
			return buffers[0];
		}
		// otherwise we need to concat them all now
		try {
			// allocate the continous memory chunk
			var continous = new Uint8Array(size);
			// process each buffer in the output queue
			for (var i = 0, offset = 0; i < buffers.length; i++) {
				continous.set(buffers[i], offset);
				offset += buffers[i].length;
			}
			// release memory chunks
			buffers[0] = continous;
			// only one chunk left
			buffers.length = 1;
			// return typed array
			return continous;
		}
		// probably allocation error
		catch (err) {
			// this error is somewhat expected so you should take care of it
			console.error("Error allocating Uint8Array of size: ", size);
			console.error("Message given was: ", err.toString());
		}
		// malloc error
		return null;
	}

	// invoke fn on every Uint8Array in the stream
	// using this interface can avoid the need to
	// create a full continous buffer of the result
	LZMA.oStream.prototype.forEach = function forEach(fn)
	{
		for (var i = 0; i < this.buffers.length; i++) {
			fn.call(this, this.buffers[i]);
		}
	}

	// returns a typed array of codepoints; depending if
	// UTF8 decoder is loaded, we treat the byte sequence
	// either as an UTF8 sequence or fixed one byte encoding
	// the result can then be converted back to a JS string
	LZMA.oStream.prototype.toCodePoints = function toCodePoints()
	{
		// treat as one byte encoding (i.e. US-ASCII)
		if (!LZMA.UTF8) { this.toUint8Array(); }
		// we could probably make this work with our chunked
		// buffers directly, but unsure how much we could gain
		return LZMA.UTF8.decode(this.toUint8Array());
	}

	// convert the buffer to a javascript string object
	LZMA.oStream.prototype.toString = function toString()
	{
		var buffers = this.buffers, string = '';
		// optionally get the UTF8 codepoints
		// possibly avoid creating a continous buffer
		if (LZMA.UTF8) buffers = [ this.toCodePoints() ];
		for (var n = 0, nL = buffers.length; n < nL; n++) {
			for (var i = 0, iL = buffers[n].length; i < iL; i++) {
				string += String.fromCharCode(buffers[n][i]);
			}
		}
		return string;
	}

})(LZMA);
;
/*

UTF-8 decoding only library for `js-lzma`.
Based on https://github.com/mathiasbynens/utf8.js

Copyright (c) 2017 Marcel Greter (http://github.com/mgreter)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

var UTF8 = UTF8 || {};

(function (UTF8) {

  "use strict";

  // http://canonical.org/~kragen/strlen-utf8.html
  // http://www.daemonology.net/blog/2008-06-05-faster-utf8-strlen.html
  // returns the number of code points for the utf8 sequence
  // usefull when pre-allocating storage for decoded results
  function utf8count(bytes) {
    // local variable access
    var j = 0, i = bytes.length;
    // process all bytes
    // order is not important
    while (i --) {
      // condition to check is quite simple
      if ((bytes[i] & 0xC0) != 0x80) ++ j;
    }
    // nr of code points
    return j;
  }

  // closures for the decoding
  // easier than to pass around
  // only one decoder active ever
  var byteArray;
  var byteCount;
  var byteIndex;

  // local variable/function access
  var fromCharCode = String.fromCharCode;

  // special check for long surrogate pairs?
  function checkScalarValue(codePoint) {
    if (codePoint >= 0xD800 && codePoint <= 0xDFFF) {
      throw Error(
        'Lone surrogate U+' + codePoint.toString(16).toUpperCase() +
        ' is not a scalar value'
      );
    }
  }
  // checkScalarValue

  // read additional bytes for a code point
  function readContinuationByte() {
    if (byteIndex >= byteCount) {
      throw Error('Invalid byte index');
    }

    var continuationByte = byteArray[byteIndex++] & 0xFF;

    if ((continuationByte & 0xC0) == 0x80) {
      return continuationByte & 0x3F;
    }

    // If we end up here, it’s not a continuation byte
    throw Error('Invalid continuation byte');
  }
  // EO readContinuationByte

  // decode one code point from byte sequence
  // stores states in the closure variables!
  function decodeSymbol() {
    var byte1 = 0;
    var byte2 = 0;
    var byte3 = 0;
    var byte4 = 0;
    var codePoint = 0;

    if ((byteIndex|0) > (byteCount|0)) {
      throw Error('Invalid byte index');
    }

    // Read first byte
    byte1 = byteArray[byteIndex] & 0xFF;
    byteIndex = (byteIndex + 1)|0;

    // 1-byte sequence (no continuation bytes)
    if ((byte1 & 0x80) == 0) {
      return byte1;
    }

    // 2-byte sequence
    if ((byte1 & 0xE0) == 0xC0) {
      byte2 = readContinuationByte();
      codePoint = ((byte1 & 0x1F) << 6) | byte2;
      if (codePoint >= 0x80) {
        return codePoint;
      } else {
        throw Error('Invalid continuation byte');
      }
    }

    // 3-byte sequence (may include unpaired surrogates)
    if ((byte1 & 0xF0) == 0xE0) {
      byte2 = readContinuationByte();
      byte3 = readContinuationByte();
      codePoint = ((byte1 & 0x0F) << 12) | (byte2 << 6) | byte3;
      if (codePoint >= 0x0800) {
        checkScalarValue(codePoint);
        return codePoint;
      } else {
        throw Error('Invalid continuation byte');
      }
    }

    // 4-byte sequence
    if ((byte1 & 0xF8) == 0xF0) {
      byte2 = readContinuationByte();
      byte3 = readContinuationByte();
      byte4 = readContinuationByte();
      codePoint = ((byte1 & 0x07) << 0x12) | (byte2 << 0x0C) |
        (byte3 << 0x06) | byte4;
      if (codePoint >= 0x010000 && codePoint <= 0x10FFFF) {
        return codePoint;
      }
    }

    throw Error('Invalid UTF-8 detected');
  }
  // decodeSymbol

  // decode Uint8Array to Uint16Array
  // UTF8 byte sequence to code points
  function utf8decode(bytes)
  {

    // count code points
    var points = 0;
    // pre-allocate for code points
    var size = utf8count(bytes);
    var codes = new Uint16Array(size);

    // init closures
    byteIndex = 0;
    byteArray = bytes;
    byteCount = bytes.length;

    // If we have a BOM skip it
    if (((byteCount|0) > 2) &
      ((byteArray[0]|0) == 0xef) &
      ((byteArray[1]|0) == 0xbb) &
      ((byteArray[2]|0) == 0xbf))
    {
      byteIndex = 3;
    }

    // process until everything is read
    while ((byteIndex|0) < (byteCount|0)) {
      // decode code point from bytes
      var code = decodeSymbol()|0;
      // add code point to output
      codes[points++] = code;
    }
    
    // Uint16Array
    return codes;
  }
  // EO utf8decode

  // export functions
  UTF8.count = utf8count;
  UTF8.decode = utf8decode;

  // hook into LZMA to be picked up
  if (typeof LZMA != 'undefined') {
    LZMA.UTF8 = UTF8;
  }

})(UTF8);

;
/*

Webworker Frontend for `js-lzma`.
This is the Main Foreground Task.

Copyright (c) 2017 Marcel Greter (http://github.com/mgreter)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

var LZMA = LZMA || {};
var WLZMA = WLZMA || {};

(function(LZMA, WLZMA) {

  "use strict";

  var wrkurl = "wlzma.wrk.min.js";

  // create manager to schedule work
  // allocate a fixed amount of threads
  // we then distribute work as needed
  WLZMA.Manager = function Manager(workers, url) {
    // set default workers
    workers = workers || 6;
    // work that has been queued
    this.queue = [];
    // our worker farm
    this.workers = [];
    url = url || wrkurl;
    // ready listeners
    this.listeners = [];
    this.isReady = false;
    this.started = 0;
    // create the worker threads
    for (var i = 0; i < workers; i ++) {
      var worker = new Worker(url);
      worker.onmessage = onReady;
      this.workers.push(worker);
      worker.manager = this;
      worker.idle = true;
    }
    // mark all idle
    this.idle = workers;
    // next worker
    this.next = 0;
  }

  // called in worker context
  function onResult(msg) {
    // local variable access
    var wid = msg.data[0],
        // Uint8Array result
        buffers = msg.data[1],
        // optional error msg
        error = msg.data[2],
        // parent manager
        mgr = this.manager;
    // mark us idle again
    this.idle = true, mgr.idle ++;
    // use us if we are lower in slots
    if (mgr.next == -1 || mgr.next > wid) {
      mgr.next = wid;
    }
    // invoke the promise handlers
    if (error) { this.reject(error); }
    else if (!buffers) { this.reject(null); }
    else { this.resolve(new LZMA.oStream(buffers)); }
    // reset promise interface
    this.resolve = null;
    this.reject = null;
    // continue working
    tick.call(mgr);
  }

  // called in manager context
  function onManagerReady()
  {
    var listeners = this.listeners,
        length = listeners.length;
    // invoke all registered handlers
    // this will work correctly even if you
    // add more handler during execution!
    while (listeners.length) {
      // remove from the array
      listeners.shift().call(this);
    }
    // we are ready now
    this.isReady = true;
  }

  // called in worker context
  function onReady(msg)
  {
    var manager = this.manager;
    // check for startup message
    if (msg.data === "ready") {
      // switch to real handler
      this.onmessage = onResult;
      // we are ready now
      this.isReady = true;
      // incerement counter
      manager.started ++;
      // check if we are fully ready now
      if (manager.started == manager.workers.length) {
        // invoke private handler
        onManagerReady.call(manager);
      }
    }
    else {
      // this indicates implementation issues
      throw Error("Worker did not startup!?")
    }
  }

  // dequeue work
  function tick() {
    // schedule more jobs if possible
    while(this.queue.length && this.idle) {
      // get worker id
      var wid = this.next;
      // get the jon from the queue
      var job = this.queue.shift();
      // jobs may be lazy loaded
      if (typeof job[0] == "function") {
        // invoke the job function
        job[0] = job[0].call(this);
      }
      // get the next free worker
      var worker = this.workers[wid];
      if (!worker) debugger;
      // invoke the worker
      worker.postMessage([wid, job[0]], [job[0]]);
      // attack promise to worker instance
      worker.resolve = job[1];
      worker.reject = job[2];
      // one less worker idle
      worker.idle = false;
      this.idle -= 1;
      // find the next idle worker
      // this.next = -1; // mark is unknown
      // workers coming back mark them self as idle
      // therefore we can just keep looking updwards
      for (var i = wid; i < this.workers.length; i++) {
        if (this.workers[i].idle) {
          this.next = i;
          return;
        }
      }
      // mark is busy
      this.next = -1;
    }
  }

  // resolve compatible types
  function getArrayBuffer(object)
  {
    if (typeof object == "object") {
      if (object instanceof LZMA.iStream) {
          object = object.array;
      }
      if (object instanceof Uint8Array) {
          object = object.buffer;
      }
    }
    return object;
  }

  // register on ready handlers which are called when
  // all workers have started up. This is not strictly
  // needed, but might prove handy at some point ...
  WLZMA.Manager.prototype.ready = function ready(handler)
  {
    if (this.isReady) { handler.call(this); }
    else { this.listeners.push(handler); }
  }

  // promisified webworker `LZMA.decompressFile` function
  WLZMA.Manager.prototype.decode = function decode(buffer)
  {
    // local closure
    var mgr = this;
    // unwrap expected array type
    buffer = getArrayBuffer(buffer);
    // might be given or we create a new one
    // outStream = outStream || new LZMA.oStream();
    // return promise now, will resolve in time
    return new Promise(function (resolve, reject) {
      // put the job on to the work queue
      mgr.queue.push([buffer, resolve, reject]);
      // invoke tick function
      tick.call(mgr)
    })
  }

})(LZMA, WLZMA);
