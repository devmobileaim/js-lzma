function LZMASM(stdlib, foreign, heap)
{
  "use asm";

  var max = stdlib.Math.max;

  var _code = 0;
  var _range = -1;
  var readed = 0;
  var written = 0;

  var coders = 0,
      posMask = 0,
      numPosStates = 0,
      posStateMask = 0;

  var lc = foreign.lc|0,
      lp = foreign.lp|0,
      pb = foreign.pb|0,
      mul = foreign.mul,
      outSize = foreign.outSize|0,
      readByte = foreign.readByte,
      writeByte = foreign.writeByte,
      writeBytes = foreign.writeBytes,
      windowSize = foreign.windowSize|0,
      dictionarySize = foreign.dictionarySize|0,
      array = new stdlib.Uint16Array(heap);

  var outBuffer = new stdlib.Uint8Array(heap);
  var outOffset = 0;
  var outWritten = 0;
  var outPosition = 0;

  var _rep0 = 0;
  var _rep1 = 0;
  var _rep2 = 0;
  var _rep3 = 0;

  function init(_lc, _lp, _pb)
  {
    _lc = _lc|0;
    _lp = _lp|0;
    _pb = _pb|0;
    lc = _lc|0;
    lp = _lp|0;
    pb = _pb|0;
    if (((lc|0) > 8) | ((lp|0) > 4) | ((pb|0) > 4)) {
      // throw Error("Incorrect stream properties");
      return 0;
    }
    coders = 1 << (lp + lc),
    posMask = ((1 << lp) - 1)|0,
    numPosStates = 1 << pb;
    posStateMask = (numPosStates - 1)|0;
    outOffset = ((coders|0) * 1536)|0 + 3180;
    return 1;
  }

//  if ((dictionarySize|0) < 0) {
//    throw Error("Incorrect dictionary size");
//  }

//  _outWindow.create( Math.max(this.dictionarySize, 4096) );

//  if (numPosStates > 8) {
//    throw Error("invalid numPosStates");
//  }

  // _allocated = outSize == 0xffffffff ? 0 : outSize;
  // _outputBuffer = new stdlib.Uint8Array(_allocated);

  // ######################################################
  // the main decoding algorithm
  // ######################################################


  function _rangeDecoder_decodeDirectBits(numTotalBits)
  {
    numTotalBits = numTotalBits|0;
    var result = 0, i = 0, t = 0;
    i = numTotalBits;
    while(i) {
      i = (i - 1)|0;
      _range = _range>>>1;
      t = (_code - _range) >>> 31;
      _code = (_code - (_range & (t - 1)))|0;
      result = (result << 1) | (1 - t);
      if ( (_range & 0xff000000) == 0) {
        _code = (_code << 8) | (readByte()|0);
        _range = _range << 8;
      }
    }
    return result|0;
  }

  function _rangeDecoder_decodeBit(offset, index)
  {
    offset = offset|0;
    index = index|0;
    var prob = 0;
    var newBound = 0;
    prob = array[(offset+index)<<1>>1]|0;
    newBound = mul((_range >>> 11)|0, prob|0)|0;

    if ( (_code ^ 0x80000000) < (newBound ^ 0x80000000) ) {
      _range = newBound;
      array[(offset+index)<<1>>1] = (array[(offset+index)<<1>>1]|0)
                                    + ((2048 - prob) >>> 5);
      if ( (_range & 0xff000000) == 0) {
        _code = (_code << 8) | (readByte()|0);
        _range = _range << 8;
      }
      return 0;
    }

    _range = _range - newBound|0;
    _code = _code - newBound|0;
    array[(offset+index)<<1>>1] = (array[(offset+index)<<1>>1]|0)
                                  - (prob >>> 5);
    if ( (_range & 0xff000000) == 0) {
      _code = (_code << 8) | (readByte()|0);
      _range = _range << 8;
    }
    return 1;
  }

  function _coders_decodeNormal(coder)
  {
    coder = coder|0;
    var symbol = 1;
    var off = 0x300;
    var pos = 0;
    off = mul(off|0, coder|0)|0;

    do {
      pos = (symbol + off)|0;
      symbol = (symbol << 1) | (_rangeDecoder_decodeBit(1590, pos|0)|0);
    } while((symbol|0) < 0x100);

    return symbol & 0xff;

  }

  function _coders_decodeWithMatchByte(coder, matchByte)
  {
    coder = coder|0;
    matchByte = matchByte|0;
    var symbol = 1, matchBit = 0, bit = 0;
    var off = 0x300;
    off = mul(off|0, coder|0)|0;
    do {
      matchBit = (matchByte >> 7) & 1;
      matchByte = matchByte << 1;
      bit = _rangeDecoder_decodeBit(1590, (((1 + matchBit|0) << 8) + symbol + off)|0)|0;
      symbol = (symbol << 1) | bit;
      if ((matchBit|0) != (bit|0)) {
        while((symbol|0) < 0x100) {
          symbol = (symbol << 1) | (_rangeDecoder_decodeBit(1590, (symbol + off)|0)|0);
        }
        break;
      }
    } while((symbol|0) < 0x100);

    return symbol & 0xff;
  }

  // returns the array index for the decoder
  function _literalDecoder_getDecoder(pos, prevByte)
  {
    pos = pos|0;
    prevByte = prevByte|0;
    return (( (pos & posMask) << lc)
    + ( (prevByte & 0xff) >>> (8 - lc) ))|0;
  }

  function _posAlignDecoder_reverseDecode()
  {
    var m = 1, symbol = 0, i = 0, bit = 0;
    for (; (i|0) < 4; i = (i + 1)|0) {
      bit = _rangeDecoder_decodeBit(802, m|0)|0;
      m = (m << 1) | bit;
      symbol = symbol | (bit << i);
    }
    return symbol|0;
  }

  function BitTree_decode(oof, posState, bits)
  {
    oof = oof|0;
    posState = posState|0;
    bits = bits|0;
    var off = 0;
    var m = 1;
    var i = 0;
    off = mul((1 << bits), posState|0)|0;
    i = bits;

    while(i) {
      m = (m << 1) | (_rangeDecoder_decodeBit(oof, (m + off)|0)|0);
      i = ((i|0) - 1)|0;
    }
    return (m - (1 << bits))|0;

  }

// (this._rangeDecoder, posState)
  function _lenDecoder_decode(posState)
  {
    posState = posState|0;
    if ((_rangeDecoder_decodeBit(818, 0)|0) == 0) {
      return BitTree_decode(1076, posState, 3)|0;
    }
    if ((_rangeDecoder_decodeBit(818, 1)|0) == 0) {
      return (8 + (BitTree_decode(1140, posState, 3)|0))|0;
    }
    return (16 + (BitTree_decode(820, 0, 8)|0))|0;
  }
  function _repLenDecoder_decode(posState)
  {
    posState = posState|0;
    if ((_rangeDecoder_decodeBit(1204, 0)|0) == 0) {
      return BitTree_decode(1462, posState, 3)|0;
    }
    if ((_rangeDecoder_decodeBit(1204, 1)|0) == 0) {
      return (8 + (BitTree_decode(1526, posState, 3)|0))|0;
    }
    return (16 + (BitTree_decode(1206, 0, 8)|0))|0;
  }

  function _outWindow_copyBlock(distance, len)
  {
    distance = distance|0;
    len = len|0;
    var pos = 0;
    pos = (outPosition - distance - 1)|0;
    if ((pos|0) < 0) {
      pos = (pos + windowSize)|0;
    }
    while(len) {
      len = (len - 1)|0;
      if ((pos|0) >= (windowSize|0)) {
        pos = 0;
      }
      outBuffer[(outOffset+outPosition)|0] =
        outBuffer[(outOffset+pos)|0];
      outPosition = (outPosition + 1)|0;
      pos = (pos + 1)|0;
      if ((outPosition|0) >= (windowSize|0)) {
        _outWindow_flush();
      }
    }
  }

  function _outWindow_putByte(b)
  {
    b = b|0;
    outBuffer[(outOffset+outPosition)|0] = b;
    outPosition = (outPosition + 1)|0;
    if ((outPosition|0) >= (windowSize|0)) {
      _outWindow_flush();
    }
  }

  function _outWindow_flush()
  {
    var i = 0;
    var size = 0;
    size = (outPosition - outWritten)|0;
    if ((size|0) != 0) {
      for (i = 0; (i|0) < (size|0); i = (i+1)|0) {
        writeByte(outBuffer[(outOffset+outWritten+i)|0]|0);
      }
      // writeBytes(outBuffer, outOffset+outWritten, size);
      outWritten = (outWritten + size)|0;
      size = 0;
      if ((outPosition|0) >= (windowSize|0)) {
        outPosition = 0;
      }
      outWritten = outPosition;
    }
  }

  function LZMA_reverseDecode(off, startIndex, numBitLevels)
  {
    off = off|0;
    startIndex = startIndex|0;
    numBitLevels = numBitLevels|0;
    var m = 1, symbol = 0, i = 0, bit = 0;

    for (; (i|0) < (numBitLevels|0); i = (i + 1)|0) {
      bit = _rangeDecoder_decodeBit(off, (startIndex + m)|0)|0;
      m = (m << 1) | bit;
      symbol = symbol | (bit << i);
    }
    return symbol|0;
  }

  function _outWindow_getByte(distance)
  {
    distance = distance|0;
    var pos =0;
    pos = (outPosition - distance - 1)|0;
    if ((pos|0) < 0) {
      pos = (pos + windowSize)|0;
    }
    return outBuffer[(outOffset+pos)|0]|0;
  }

  function decode()
  {
    var i = 0;
    var len = 0;
    var count = 0;
    var distance = 0;
    var posSlot = 0;

    var state = 0;
    var coder = 0;
    var nowPos64 = 0;
    var prevByte = 0;
    var posState = 0;
    var numDirectBits = 0;

    // init the range decoder now
    for (i = 0; (i|0) < 5; i = (i + 1)|0) {
      _code = (_code << 8) | (readByte()|0)
    }

    while(((outSize|0) < 0) | ((nowPos64|0) < (outSize|0))) {
      posState = nowPos64 & posStateMask;

      if ((_rangeDecoder_decodeBit(0, ((state << 4) + posState)|0)|0) == 0) {
        coder = _literalDecoder_getDecoder(nowPos64, prevByte)|0;
        nowPos64 = (nowPos64 + 1)|0

        if ((state|0) >= 7) {
          prevByte = _coders_decodeWithMatchByte(coder, _outWindow_getByte(_rep0)|0)|0;
        } else {
          prevByte = _coders_decodeNormal(coder)|0;
        }
        _outWindow_putByte(prevByte);

        state = (state|0) < 4 ? 0 : (state - ((state|0) < 10 ? 3: 6))|0;

      } else {
        if ((_rangeDecoder_decodeBit(192, state)|0) == 1) {
          len = 0;
          if ((_rangeDecoder_decodeBit(204, state)|0) == 0) {
            if ((_rangeDecoder_decodeBit(240, ((state << 4) + posState)|0)|0) == 0) {
              state = (state|0) < 7 ? 9 : 11;
              len = 1;
            }
          } else {
            if ((_rangeDecoder_decodeBit(216, state)|0) == 0) {
              distance = _rep1;
            } else {
              if ((_rangeDecoder_decodeBit(228, state)|0) == 0) {
                distance = _rep2;
              } else {
                distance = _rep3;
                _rep3 = _rep2;
              }
              _rep2 = _rep1;
            }
            _rep1 = _rep0;
            _rep0 = distance;
          }
          if ((len|0) == 0) {
            len = (2 + (_repLenDecoder_decode(posState)|0))|0;
            state = (state|0) < 7 ? 8 : 11;
          }

        } else {

          _rep3 = _rep2;
          _rep2 = _rep1;
          _rep1 = _rep0;

          len = (2 + (_lenDecoder_decode(posState)|0))|0;
          state = (state|0) < 7 ? 7 : 10;

          posSlot = BitTree_decode(432, (len|0) <= 5 ? (len - 2)|0 : 3, 6)|0;
          if ((posSlot|0) >= 4) {

            numDirectBits = ((posSlot >> 1) - 1)|0;
            _rep0 = (2 | (posSlot & 1) ) << numDirectBits;

            if ((posSlot|0) < 14) {
              _rep0 = (_rep0 + (LZMA_reverseDecode(688, (_rep0 - posSlot - 1)|0, numDirectBits)|0))|0;
            } else {
              _rep0 = (_rep0 + ((_rangeDecoder_decodeDirectBits((numDirectBits - 4)|0)|0) << 4))|0;
              _rep0 = (_rep0 + (_posAlignDecoder_reverseDecode()|0))|0;
              if ((_rep0|0) < 0) {
                if ((_rep0|0) == -1) {
                  break;
                }
                return 0;
              }
            }
          } else {
            _rep0 = posSlot;
          }
        }

        if (((_rep0|0) >= (nowPos64|0)) | ((_rep0|0) >= (dictionarySize|0))) {
          return 0;
        }

        _outWindow_copyBlock(_rep0, len);
        nowPos64 = (nowPos64 + len)|0;
        prevByte = _outWindow_getByte(0)|0;

      }
    }

    _outWindow_flush();
    // _outWindow_finalize();

    return 1;
  }


/*
    function f(x, y) {
        // SECTION A: parameter type declarations
        x = x|0;      // int parameter
        y = +y;       // double parameter

        // SECTION B: function body
        log(x|0);     // call into FFI -- must force the sign
        log(y);       // call into FFI -- already know it's a double
        x = (x+3)|0;  // signed addition

        // SECTION C: unconditional return
        return ((((x+1)|0)>>>0)/(x>>>0))|0; // compound expression
    }

    // -------------------------------------------------------------------------
    // SECTION 3: function tables

    var ftable_1 = [f];
*/
    var ftable_1 = [init];
    var ftable_2 = [decode];

    // -------------------------------------------------------------------------
    // SECTION 4: exports

    return { init: init, decode: decode };
}