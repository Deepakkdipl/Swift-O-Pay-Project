(function(factory) {
  if (typeof define === 'function' && define.amd && define.amd.jQuery) {
    // AMD. Register as anonymous module.
    define(['jquery'], factory);
  } else if (typeof module !== 'undefined' && module.exports) {
    // CommonJS Module
    factory(require("jquery"));
  } else {
    // Browser globals.
    factory(jQuery);
  }
}(function($) {
  "use strict";
  var VERSION = "1.6.18",
    LEFT = "left",
    RIGHT = "right",
    UP = "up",
    DOWN = "down",
    IN = "in",
    OUT = "out",
    NONE = "none",
    AUTO = "auto",
    SWIPE = "swipe",
    PINCH = "pinch",
    TAP = "tap",
    DOUBLE_TAP = "doubletap",
    LONG_TAP = "longtap",
    HOLD = "hold",
    HORIZONTAL = "horizontal",
    VERTICAL = "vertical",
    ALL_FINGERS = "all",
    DOUBLE_TAP_THRESHOLD = 10,
    PHASE_START = "start",
    PHASE_MOVE = "move",
    PHASE_END = "end",
    PHASE_CANCEL = "cancel",
    SUPPORTS_TOUCH = 'ontouchstart' in window,
    SUPPORTS_POINTER_IE10 = window.navigator.msPointerEnabled && !window.navigator.pointerEnabled && !SUPPORTS_TOUCH,
    SUPPORTS_POINTER = (window.navigator.pointerEnabled || window.navigator.msPointerEnabled) && !SUPPORTS_TOUCH,
    PLUGIN_NS = 'TouchSwipe';
  var defaults = {
    fingers: 1,
    threshold: 75,
    cancelThreshold: null,
    pinchThreshold: 20,
    maxTimeThreshold: null,
    fingerReleaseThreshold: 250,
    longTapThreshold: 500,
    doubleTapThreshold: 200,
    swipe: null,
    swipeLeft: null,
    swipeRight: null,
    swipeUp: null,
    swipeDown: null,
    swipeStatus: null,
    pinchIn: null,
    pinchOut: null,
    pinchStatus: null,
    click: null, //Deprecated since 1.6.2
    tap: null,
    doubleTap: null,
    longTap: null,
    hold: null,
    triggerOnTouchEnd: true,
    triggerOnTouchLeave: false,
    allowPageScroll: "auto",
    fallbackToMouseEvents: true,
    excludedElements: ".noSwipe",
    preventDefaultEvents: true
  };
  $.fn.swipe = function(method) {
    var $this = $(this),
      plugin = $this.data(PLUGIN_NS);
    if (plugin && typeof method === 'string') {
      if (plugin[method]) {
        return plugin[method].apply(plugin, Array.prototype.slice.call(arguments, 1));
      } else {
        $.error('Method ' + method + ' does not exist on jQuery.swipe');
      }
    }
    else if (plugin && typeof method === 'object') {
      plugin['option'].apply(plugin, arguments);
    }
    else if (!plugin && (typeof method === 'object' || !method)) {
      return init.apply(this, arguments);
    }

    return $this;
  };

  $.fn.swipe.version = VERSION;
  $.fn.swipe.defaults = defaults;
  $.fn.swipe.phases = {
    PHASE_START: PHASE_START,
    PHASE_MOVE: PHASE_MOVE,
    PHASE_END: PHASE_END,
    PHASE_CANCEL: PHASE_CANCEL
  };
  $.fn.swipe.directions = {
    LEFT: LEFT,
    RIGHT: RIGHT,
    UP: UP,
    DOWN: DOWN,
    IN: IN,
    OUT: OUT
  };
  $.fn.swipe.pageScroll = {
    NONE: NONE,
    HORIZONTAL: HORIZONTAL,
    VERTICAL: VERTICAL,
    AUTO: AUTO
  };
  $.fn.swipe.fingers = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
    ALL: ALL_FINGERS
  };
  function init(options) {
    //Prep and extend the options
    if (options && (options.allowPageScroll === undefined && (options.swipe !== undefined || options.swipeStatus !== undefined))) {
      options.allowPageScroll = NONE;
    }
    if (options.click !== undefined && options.tap === undefined) {
      options.tap = options.click;
    }

    if (!options) {
      options = {};
    }

    //pass empty object so we dont modify the defaults
    options = $.extend({}, $.fn.swipe.defaults, options);

    //For each element instantiate the plugin
    return this.each(function() {
      var $this = $(this);

      //Check we havent already initialised the plugin
      var plugin = $this.data(PLUGIN_NS);

      if (!plugin) {
        plugin = new TouchSwipe(this, options);
        $this.data(PLUGIN_NS, plugin);
      }
    });
  }
  function TouchSwipe(element, options) {

    //take a local/instacne level copy of the options - should make it this.options really...
    var options = $.extend({}, options);

    var useTouchEvents = (SUPPORTS_TOUCH || SUPPORTS_POINTER || !options.fallbackToMouseEvents),
      START_EV = useTouchEvents ? (SUPPORTS_POINTER ? (SUPPORTS_POINTER_IE10 ? 'MSPointerDown' : 'pointerdown') : 'touchstart') : 'mousedown',
      MOVE_EV = useTouchEvents ? (SUPPORTS_POINTER ? (SUPPORTS_POINTER_IE10 ? 'MSPointerMove' : 'pointermove') : 'touchmove') : 'mousemove',
      END_EV = useTouchEvents ? (SUPPORTS_POINTER ? (SUPPORTS_POINTER_IE10 ? 'MSPointerUp' : 'pointerup') : 'touchend') : 'mouseup',
      LEAVE_EV = useTouchEvents ? (SUPPORTS_POINTER ? 'mouseleave' : null) : 'mouseleave', //we manually detect leave on touch devices, so null event here
      CANCEL_EV = (SUPPORTS_POINTER ? (SUPPORTS_POINTER_IE10 ? 'MSPointerCancel' : 'pointercancel') : 'touchcancel');



    //touch properties
    var distance = 0,
      direction = null,
      currentDirection = null,
      duration = 0,
      startTouchesDistance = 0,
      endTouchesDistance = 0,
      pinchZoom = 1,
      pinchDistance = 0,
      pinchDirection = 0,
      maximumsMap = null;



    //jQuery wrapped element for this instance
    var $element = $(element);

    //Current phase of th touch cycle
    var phase = "start";

    // the current number of fingers being used.
    var fingerCount = 0;

    //track mouse points / delta
    var fingerData = {};

    //track times
    var startTime = 0,
      endTime = 0,
      previousTouchEndTime = 0,
      fingerCountAtRelease = 0,
      doubleTapStartTime = 0;

    //Timeouts
    var singleTapTimeout = null,
      holdTimeout = null;

    // Add gestures to all swipable areas if supported
    try {
      $element.bind(START_EV, touchStart);
      $element.bind(CANCEL_EV, touchCancel);
    } catch (e) {
      $.error('events not supported ' + START_EV + ',' + CANCEL_EV + ' on jQuery.swipe');
    }
    this.enable = function() {
      //Incase we are already enabled, clean up...
      this.disable();
      $element.bind(START_EV, touchStart);
      $element.bind(CANCEL_EV, touchCancel);
      return $element;
    };
    this.disable = function() {
      removeListeners();
      return $element;
    };
    this.destroy = function() {
      removeListeners();
      $element.data(PLUGIN_NS, null);
      $element = null;
    };
    this.option = function(property, value) {

      if (typeof property === 'object') {
        options = $.extend(options, property);
      } else if (options[property] !== undefined) {
        if (value === undefined) {
          return options[property];
        } else {
          options[property] = value;
        }
      } else if (!property) {
        return options;
      } else {
        $.error('Option ' + property + ' does not exist on jQuery.swipe.options');
      }

      return null;
    }
    function touchStart(jqEvent) {
      if (getTouchInProgress()) {
        return;
      }
      if ($(jqEvent.target).closest(options.excludedElements, $element).length > 0) {
        return;
      }
      var event = jqEvent.originalEvent ? jqEvent.originalEvent : jqEvent;
      if(event.pointerType && event.pointerType=="mouse" && options.fallbackToMouseEvents==false) {
        return;
      };
      var ret,
        touches = event.touches,
        evt = touches ? touches[0] : event;

      phase = PHASE_START;

      //If we support touches, get the finger count
      if (touches) {
        // get the total number of fingers touching the screen
        fingerCount = touches.length;
      }
      //Else this is the desktop, so stop the browser from dragging content
      else if (options.preventDefaultEvents !== false) {
        jqEvent.preventDefault(); //call this on jq event so we are cross browser
      }

      //clear vars..
      distance = 0;
      direction = null;
      currentDirection=null;
      pinchDirection = null;
      duration = 0;
      startTouchesDistance = 0;
      endTouchesDistance = 0;
      pinchZoom = 1;
      pinchDistance = 0;
      maximumsMap = createMaximumsData();
      cancelMultiFingerRelease();

      //Create the default finger data
      createFingerData(0, evt);

      // check the number of fingers is what we are looking for, or we are capturing pinches
      if (!touches || (fingerCount === options.fingers || options.fingers === ALL_FINGERS) || hasPinches()) {
        // get the coordinates of the touch
        startTime = getTimeStamp();

        if (fingerCount == 2) {
          //Keep track of the initial pinch distance, so we can calculate the diff later
          //Store second finger data as start
          createFingerData(1, touches[1]);
          startTouchesDistance = endTouchesDistance = calculateTouchesDistance(fingerData[0].start, fingerData[1].start);
        }

        if (options.swipeStatus || options.pinchStatus) {
          ret = triggerHandler(event, phase);
        }
      } else {
        //A touch with more or less than the fingers we are looking for, so cancel
        ret = false;
      }

      //If we have a return value from the users handler, then return and cancel
      if (ret === false) {
        phase = PHASE_CANCEL;
        triggerHandler(event, phase);
        return ret;
      } else {
        if (options.hold) {
          holdTimeout = setTimeout($.proxy(function() {
            //Trigger the event
            $element.trigger('hold', [event.target]);
            //Fire the callback
            if (options.hold) {
              ret = options.hold.call($element, event, event.target);
            }
          }, this), options.longTapThreshold);
        }

        setTouchInProgress(true);
      }

      return null;
    };
    function touchMove(jqEvent) {
      var event = jqEvent.originalEvent ? jqEvent.originalEvent : jqEvent;
      if (phase === PHASE_END || phase === PHASE_CANCEL || inMultiFingerRelease())
        return;

      var ret,
        touches = event.touches,
        evt = touches ? touches[0] : event;
      var currentFinger = updateFingerData(evt);
      endTime = getTimeStamp();

      if (touches) {
        fingerCount = touches.length;
      }

      if (options.hold) {
        clearTimeout(holdTimeout);
      }

      phase = PHASE_MOVE;
      if (fingerCount == 2) {
        if (startTouchesDistance == 0) {
          createFingerData(1, touches[1]);
          startTouchesDistance = endTouchesDistance = calculateTouchesDistance(fingerData[0].start, fingerData[1].start);
        } else {
          //Else just update the second finger
          updateFingerData(touches[1]);

          endTouchesDistance = calculateTouchesDistance(fingerData[0].end, fingerData[1].end);
          pinchDirection = calculatePinchDirection(fingerData[0].end, fingerData[1].end);
        }

        pinchZoom = calculatePinchZoom(startTouchesDistance, endTouchesDistance);
        pinchDistance = Math.abs(startTouchesDistance - endTouchesDistance);
      }

      if ((fingerCount === options.fingers || options.fingers === ALL_FINGERS) || !touches || hasPinches()) {

        //The overall direction of the swipe. From start to now.
        direction = calculateDirection(currentFinger.start, currentFinger.end);

        //The immediate direction of the swipe, direction between the last movement and this one.
        currentDirection = calculateDirection(currentFinger.last, currentFinger.end);

        //Check if we need to prevent default event (page scroll / pinch zoom) or not
        validateDefaultEvent(jqEvent, currentDirection);

        //Distance and duration are all off the main finger
        distance = calculateDistance(currentFinger.start, currentFinger.end);
        duration = calculateDuration();

        //Cache the maximum distance we made in this direction
        setMaxDistance(direction, distance);

        //Trigger status handler
        ret = triggerHandler(event, phase);


        //If we trigger end events when threshold are met, or trigger events when touch leaves element
        if (!options.triggerOnTouchEnd || options.triggerOnTouchLeave) {

          var inBounds = true;

          //If checking if we leave the element, run the bounds check (we can use touchleave as its not supported on webkit)
          if (options.triggerOnTouchLeave) {
            var bounds = getbounds(this);
            inBounds = isInBounds(currentFinger.end, bounds);
          }

          //Trigger end handles as we swipe if thresholds met or if we have left the element if the user has asked to check these..
          if (!options.triggerOnTouchEnd && inBounds) {
            phase = getNextPhase(PHASE_MOVE);
          }
          //We end if out of bounds here, so set current phase to END, and check if its modified
          else if (options.triggerOnTouchLeave && !inBounds) {
            phase = getNextPhase(PHASE_END);
          }

          if (phase == PHASE_CANCEL || phase == PHASE_END) {
            triggerHandler(event, phase);
          }
        }
      } else {
        phase = PHASE_CANCEL;
        triggerHandler(event, phase);
      }

      if (ret === false) {
        phase = PHASE_CANCEL;
        triggerHandler(event, phase);
      }
    }
    function touchEnd(jqEvent) {
      var event = jqEvent.originalEvent ? jqEvent.originalEvent : jqEvent,
        touches = event.touches;
      if (touches) {
        if (touches.length && !inMultiFingerRelease()) {
          startMultiFingerRelease(event);
          return true;
        } else if (touches.length && inMultiFingerRelease()) {
          return true;
        }
      }
      if (inMultiFingerRelease()) {
        fingerCount = fingerCountAtRelease;
      }
      endTime = getTimeStamp();

      //Get duration incase move was never fired
      duration = calculateDuration();

      //If we trigger handlers at end of swipe OR, we trigger during, but they didnt trigger and we are still in the move phase
      if (didSwipeBackToCancel() || !validateSwipeDistance()) {
        phase = PHASE_CANCEL;
        triggerHandler(event, phase);
      } else if (options.triggerOnTouchEnd || (options.triggerOnTouchEnd === false && phase === PHASE_MOVE)) {
        //call this on jq event so we are cross browser
        if (options.preventDefaultEvents !== false && jqEvent.cancelable !== false) {
          jqEvent.preventDefault();
        }
        phase = PHASE_END;
        triggerHandler(event, phase);
      }
      else if (!options.triggerOnTouchEnd && hasTap()) {
        //Trigger the pinch events...
        phase = PHASE_END;
        triggerHandlerForGesture(event, phase, TAP);
      } else if (phase === PHASE_MOVE) {
        phase = PHASE_CANCEL;
        triggerHandler(event, phase);
      }

      setTouchInProgress(false);

      return null;
    }
    function touchCancel() {
      fingerCount = 0;
      endTime = 0;
      startTime = 0;
      startTouchesDistance = 0;
      endTouchesDistance = 0;
      pinchZoom = 1;
      cancelMultiFingerRelease();
      setTouchInProgress(false);
    }
    function touchLeave(jqEvent) {
      var event = jqEvent.originalEvent ? jqEvent.originalEvent : jqEvent;
      if (options.triggerOnTouchLeave) {
        phase = getNextPhase(PHASE_END);
        triggerHandler(event, phase);
      }
    }
    function removeListeners() {
      $element.unbind(START_EV, touchStart);
      $element.unbind(CANCEL_EV, touchCancel);
      $element.unbind(MOVE_EV, touchMove);
      $element.unbind(END_EV, touchEnd);

      //we only have leave events on desktop, we manually calculate leave on touch as its not supported in webkit
      if (LEAVE_EV) {
        $element.unbind(LEAVE_EV, touchLeave);
      }

      setTouchInProgress(false);
    }


    /**
     * Checks if the time and distance thresholds have been met, and if so then the appropriate handlers are fired.
     */
    function getNextPhase(currentPhase) {

      var nextPhase = currentPhase;

      // Ensure we have valid swipe (under time and over distance  and check if we are out of bound...)
      var validTime = validateSwipeTime();
      var validDistance = validateSwipeDistance();
      var didCancel = didSwipeBackToCancel();

      //If we have exceeded our time, then cancel
      if (!validTime || didCancel) {
        nextPhase = PHASE_CANCEL;
      }
      //Else if we are moving, and have reached distance then end
      else if (validDistance && currentPhase == PHASE_MOVE && (!options.triggerOnTouchEnd || options.triggerOnTouchLeave)) {
        nextPhase = PHASE_END;
      }
      //Else if we have ended by leaving and didn't reach distance, then cancel
      else if (!validDistance && currentPhase == PHASE_END && options.triggerOnTouchLeave) {
        nextPhase = PHASE_CANCEL;
      }

      return nextPhase;
    }
    function triggerHandler(event, phase) {



      var ret,
        touches = event.touches;

      // SWIPE GESTURES
      if (didSwipe() || hasSwipes()) {
          ret = triggerHandlerForGesture(event, phase, SWIPE);
      }

      // PINCH GESTURES (if the above didn't cancel)
      if ((didPinch() || hasPinches()) && ret !== false) {
          ret = triggerHandlerForGesture(event, phase, PINCH);
      }

      // CLICK / TAP (if the above didn't cancel)
      if (didDoubleTap() && ret !== false) {
        //Trigger the tap events...
        ret = triggerHandlerForGesture(event, phase, DOUBLE_TAP);
      }

      // CLICK / TAP (if the above didn't cancel)
      else if (didLongTap() && ret !== false) {
        //Trigger the tap events...
        ret = triggerHandlerForGesture(event, phase, LONG_TAP);
      }

      // CLICK / TAP (if the above didn't cancel)
      else if (didTap() && ret !== false) {
        //Trigger the tap event..
        ret = triggerHandlerForGesture(event, phase, TAP);
      }



      // If we are cancelling the gesture, then manually trigger the reset handler
      if (phase === PHASE_CANCEL) {

        touchCancel(event);
      }




      // If we are ending the gesture, then manually trigger the reset handler IF all fingers are off
      if (phase === PHASE_END) {
        //If we support touch, then check that all fingers are off before we cancel
        if (touches) {
          if (!touches.length) {
            touchCancel(event);
          }
        } else {
          touchCancel(event);
        }
      }

      return ret;
    }
    function triggerHandlerForGesture(event, phase, gesture) {

      var ret;

      //SWIPES....
      if (gesture == SWIPE) {
        //Trigger status every time..
        $element.trigger('swipeStatus', [phase, direction || null, distance || 0, duration || 0, fingerCount, fingerData, currentDirection]);

        if (options.swipeStatus) {
          ret = options.swipeStatus.call($element, event, phase, direction || null, distance || 0, duration || 0, fingerCount, fingerData, currentDirection);
          //If the status cancels, then dont run the subsequent event handlers..
          if (ret === false) return false;
        }

        if (phase == PHASE_END && validateSwipe()) {

          //Cancel any taps that were in progress...
          clearTimeout(singleTapTimeout);
          clearTimeout(holdTimeout);

          $element.trigger('swipe', [direction, distance, duration, fingerCount, fingerData, currentDirection]);

          if (options.swipe) {
            ret = options.swipe.call($element, event, direction, distance, duration, fingerCount, fingerData, currentDirection);
            //If the status cancels, then dont run the subsequent event handlers..
            if (ret === false) return false;
          }

          //trigger direction specific event handlers
          switch (direction) {
            case LEFT:
              $element.trigger('swipeLeft', [direction, distance, duration, fingerCount, fingerData, currentDirection]);

              if (options.swipeLeft) {
                ret = options.swipeLeft.call($element, event, direction, distance, duration, fingerCount, fingerData, currentDirection);
              }
              break;

            case RIGHT:
              $element.trigger('swipeRight', [direction, distance, duration, fingerCount, fingerData, currentDirection]);

              if (options.swipeRight) {
                ret = options.swipeRight.call($element, event, direction, distance, duration, fingerCount, fingerData, currentDirection);
              }
              break;

            case UP:
              $element.trigger('swipeUp', [direction, distance, duration, fingerCount, fingerData, currentDirection]);

              if (options.swipeUp) {
                ret = options.swipeUp.call($element, event, direction, distance, duration, fingerCount, fingerData, currentDirection);
              }
              break;

            case DOWN:
              $element.trigger('swipeDown', [direction, distance, duration, fingerCount, fingerData, currentDirection]);

              if (options.swipeDown) {
                ret = options.swipeDown.call($element, event, direction, distance, duration, fingerCount, fingerData, currentDirection);
              }
              break;
          }
        }
      }


      //PINCHES....
      if (gesture == PINCH) {
        $element.trigger('pinchStatus', [phase, pinchDirection || null, pinchDistance || 0, duration || 0, fingerCount, pinchZoom, fingerData]);

        if (options.pinchStatus) {
          ret = options.pinchStatus.call($element, event, phase, pinchDirection || null, pinchDistance || 0, duration || 0, fingerCount, pinchZoom, fingerData);
          //If the status cancels, then dont run the subsequent event handlers..
          if (ret === false) return false;
        }

        if (phase == PHASE_END && validatePinch()) {

          switch (pinchDirection) {
            case IN:
              $element.trigger('pinchIn', [pinchDirection || null, pinchDistance || 0, duration || 0, fingerCount, pinchZoom, fingerData]);

              if (options.pinchIn) {
                ret = options.pinchIn.call($element, event, pinchDirection || null, pinchDistance || 0, duration || 0, fingerCount, pinchZoom, fingerData);
              }
              break;

            case OUT:
              $element.trigger('pinchOut', [pinchDirection || null, pinchDistance || 0, duration || 0, fingerCount, pinchZoom, fingerData]);

              if (options.pinchOut) {
                ret = options.pinchOut.call($element, event, pinchDirection || null, pinchDistance || 0, duration || 0, fingerCount, pinchZoom, fingerData);
              }
              break;
          }
        }
      }

      if (gesture == TAP) {
        if (phase === PHASE_CANCEL || phase === PHASE_END) {

          clearTimeout(singleTapTimeout);
          clearTimeout(holdTimeout);

          //If we are also looking for doubelTaps, wait incase this is one...
          if (hasDoubleTap() && !inDoubleTap()) {
            doubleTapStartTime = getTimeStamp();

            //Now wait for the double tap timeout, and trigger this single tap
            //if its not cancelled by a double tap
            singleTapTimeout = setTimeout($.proxy(function() {
              doubleTapStartTime = null;
              $element.trigger('tap', [event.target]);

              if (options.tap) {
                ret = options.tap.call($element, event, event.target);
              }
            }, this), options.doubleTapThreshold);

          } else {
            doubleTapStartTime = null;
            $element.trigger('tap', [event.target]);
            if (options.tap) {
              ret = options.tap.call($element, event, event.target);
            }
          }
        }
      } else if (gesture == DOUBLE_TAP) {
        if (phase === PHASE_CANCEL || phase === PHASE_END) {
          clearTimeout(singleTapTimeout);
          clearTimeout(holdTimeout);
          doubleTapStartTime = null;
          $element.trigger('doubletap', [event.target]);

          if (options.doubleTap) {
            ret = options.doubleTap.call($element, event, event.target);
          }
        }
      } else if (gesture == LONG_TAP) {
        if (phase === PHASE_CANCEL || phase === PHASE_END) {
          clearTimeout(singleTapTimeout);
          doubleTapStartTime = null;

          $element.trigger('longtap', [event.target]);
          if (options.longTap) {
            ret = options.longTap.call($element, event, event.target);
          }
        }
      }

      return ret;
    }
    function validateSwipeDistance() {
      var valid = true;
      //If we made it past the min swipe distance..
      if (options.threshold !== null) {
        valid = distance >= options.threshold;
      }

      return valid;
    }
    function didSwipeBackToCancel() {
      var cancelled = false;
      if (options.cancelThreshold !== null && direction !== null) {
        cancelled = (getMaxDistance(direction) - distance) >= options.cancelThreshold;
      }

      return cancelled;
    }
    function validatePinchDistance() {
      if (options.pinchThreshold !== null) {
        return pinchDistance >= options.pinchThreshold;
      }
      return true;
    }
    function validateSwipeTime() {
      var result;
      //If no time set, then return true
      if (options.maxTimeThreshold) {
        if (duration >= options.maxTimeThreshold) {
          result = false;
        } else {
          result = true;
        }
      } else {
        result = true;
      }

      return result;
    }
    function validateDefaultEvent(jqEvent, direction) {

      //If the option is set, allways allow the event to bubble up (let user handle weirdness)
      if (options.preventDefaultEvents === false) {
        return;
      }

      if (options.allowPageScroll === NONE) {
        jqEvent.preventDefault();
      } else {
        var auto = options.allowPageScroll === AUTO;

        switch (direction) {
          case LEFT:
            if ((options.swipeLeft && auto) || (!auto && options.allowPageScroll != HORIZONTAL)) {
              jqEvent.preventDefault();
            }
            break;

          case RIGHT:
            if ((options.swipeRight && auto) || (!auto && options.allowPageScroll != HORIZONTAL)) {
              jqEvent.preventDefault();
            }
            break;

          case UP:
            if ((options.swipeUp && auto) || (!auto && options.allowPageScroll != VERTICAL)) {
              jqEvent.preventDefault();
            }
            break;

          case DOWN:
            if ((options.swipeDown && auto) || (!auto && options.allowPageScroll != VERTICAL)) {
              jqEvent.preventDefault();
            }
            break;

          case NONE:

            break;
        }
      }
    }


    // PINCHES
    /**
     * Returns true of the current pinch meets the thresholds
     * @return Boolean
     * @inner
     */
    function validatePinch() {
      var hasCorrectFingerCount = validateFingers();
      var hasEndPoint = validateEndPoint();
      var hasCorrectDistance = validatePinchDistance();
      return hasCorrectFingerCount && hasEndPoint && hasCorrectDistance;

    }

    /**
     * Returns true if any Pinch events have been registered
     * @return Boolean
     * @inner
     */
    function hasPinches() {
      //Enure we dont return 0 or null for false values
      return !!(options.pinchStatus || options.pinchIn || options.pinchOut);
    }

    /**
     * Returns true if we are detecting pinches, and have one
     * @return Boolean
     * @inner
     */
    function didPinch() {
      //Enure we dont return 0 or null for false values
      return !!(validatePinch() && hasPinches());
    }




    // SWIPES
    /**
     * Returns true if the current swipe meets the thresholds
     * @return Boolean
     * @inner
     */
    function validateSwipe() {
      //Check validity of swipe
      var hasValidTime = validateSwipeTime();
      var hasValidDistance = validateSwipeDistance();
      var hasCorrectFingerCount = validateFingers();
      var hasEndPoint = validateEndPoint();
      var didCancel = didSwipeBackToCancel();

      // if the user swiped more than the minimum length, perform the appropriate action
      // hasValidDistance is null when no distance is set
      var valid = !didCancel && hasEndPoint && hasCorrectFingerCount && hasValidDistance && hasValidTime;

      return valid;
    }

    /**
     * Returns true if any Swipe events have been registered
     * @return Boolean
     * @inner
     */
    function hasSwipes() {
      //Enure we dont return 0 or null for false values
      return !!(options.swipe || options.swipeStatus || options.swipeLeft || options.swipeRight || options.swipeUp || options.swipeDown);
    }


    /**
     * Returns true if we are detecting swipes and have one
     * @return Boolean
     * @inner
     */
    function didSwipe() {
      //Enure we dont return 0 or null for false values
      return !!(validateSwipe() && hasSwipes());
    }

    /**
     * Returns true if we have matched the number of fingers we are looking for
     * @return Boolean
     * @inner
     */
    function validateFingers() {
      //The number of fingers we want were matched, or on desktop we ignore
      return ((fingerCount === options.fingers || options.fingers === ALL_FINGERS) || !SUPPORTS_TOUCH);
    }

    /**
     * Returns true if we have an end point for the swipe
     * @return Boolean
     * @inner
     */
    function validateEndPoint() {
      //We have an end value for the finger
      return fingerData[0].end.x !== 0;
    }

    // TAP / CLICK
    /**
     * Returns true if a click / tap events have been registered
     * @return Boolean
     * @inner
     */
    function hasTap() {
      //Enure we dont return 0 or null for false values
      return !!(options.tap);
    }

    /**
     * Returns true if a double tap events have been registered
     * @return Boolean
     * @inner
     */
    function hasDoubleTap() {
      //Enure we dont return 0 or null for false values
      return !!(options.doubleTap);
    }

    /**
     * Returns true if any long tap events have been registered
     * @return Boolean
     * @inner
     */
    function hasLongTap() {
      //Enure we dont return 0 or null for false values
      return !!(options.longTap);
    }

    /**
     * Returns true if we could be in the process of a double tap (one tap has occurred, we are listening for double taps, and the threshold hasn't past.
     * @return Boolean
     * @inner
     */
    function validateDoubleTap() {
      if (doubleTapStartTime == null) {
        return false;
      }
      var now = getTimeStamp();
      return (hasDoubleTap() && ((now - doubleTapStartTime) <= options.doubleTapThreshold));
    }

    /**
     * Returns true if we could be in the process of a double tap (one tap has occurred, we are listening for double taps, and the threshold hasn't past.
     * @return Boolean
     * @inner
     */
    function inDoubleTap() {
      return validateDoubleTap();
    }


    /**
     * Returns true if we have a valid tap
     * @return Boolean
     * @inner
     */
    function validateTap() {
      return ((fingerCount === 1 || !SUPPORTS_TOUCH) && (isNaN(distance) || distance < options.threshold));
    }

    /**
     * Returns true if we have a valid long tap
     * @return Boolean
     * @inner
     */
    function validateLongTap() {
      //slight threshold on moving finger
      return ((duration > options.longTapThreshold) && (distance < DOUBLE_TAP_THRESHOLD));
    }

    /**
     * Returns true if we are detecting taps and have one
     * @return Boolean
     * @inner
     */
    function didTap() {
      //Enure we dont return 0 or null for false values
      return !!(validateTap() && hasTap());
    }


    /**
     * Returns true if we are detecting double taps and have one
     * @return Boolean
     * @inner
     */
    function didDoubleTap() {
      //Enure we dont return 0 or null for false values
      return !!(validateDoubleTap() && hasDoubleTap());
    }

    /**
     * Returns true if we are detecting long taps and have one
     * @return Boolean
     * @inner
     */
    function didLongTap() {
      //Enure we dont return 0 or null for false values
      return !!(validateLongTap() && hasLongTap());
    }




    // MULTI FINGER TOUCH
    /**
     * Starts tracking the time between 2 finger releases, and keeps track of how many fingers we initially had up
     * @inner
     */
    function startMultiFingerRelease(event) {
      previousTouchEndTime = getTimeStamp();
      fingerCountAtRelease = event.touches.length + 1;
    }

    /**
     * Cancels the tracking of time between 2 finger releases, and resets counters
     * @inner
     */
    function cancelMultiFingerRelease() {
      previousTouchEndTime = 0;
      fingerCountAtRelease = 0;
    }

    /**
     * Checks if we are in the threshold between 2 fingers being released
     * @return Boolean
     * @inner
     */
    function inMultiFingerRelease() {

      var withinThreshold = false;

      if (previousTouchEndTime) {
        var diff = getTimeStamp() - previousTouchEndTime
        if (diff <= options.fingerReleaseThreshold) {
          withinThreshold = true;
        }
      }

      return withinThreshold;
    }


    /**
     * gets a data flag to indicate that a touch is in progress
     * @return Boolean
     * @inner
     */
    function getTouchInProgress() {
      //strict equality to ensure only true and false are returned
      return !!($element.data(PLUGIN_NS + '_intouch') === true);
    }

    /**
     * Sets a data flag to indicate that a touch is in progress
     * @param {boolean} val The value to set the property to
     * @inner
     */
    function setTouchInProgress(val) {

      //If destroy is called in an event handler, we have no el, and we have already cleaned up, so return.
      if(!$element) { return; }

      //Add or remove event listeners depending on touch status
      if (val === true) {
        $element.bind(MOVE_EV, touchMove);
        $element.bind(END_EV, touchEnd);

        //we only have leave events on desktop, we manually calcuate leave on touch as its not supported in webkit
        if (LEAVE_EV) {
          $element.bind(LEAVE_EV, touchLeave);
        }
      } else {

        $element.unbind(MOVE_EV, touchMove, false);
        $element.unbind(END_EV, touchEnd, false);

        //we only have leave events on desktop, we manually calcuate leave on touch as its not supported in webkit
        if (LEAVE_EV) {
          $element.unbind(LEAVE_EV, touchLeave, false);
        }
      }


      //strict equality to ensure only true and false can update the value
      $element.data(PLUGIN_NS + '_intouch', val === true);
    }


    /**
     * Creates the finger data for the touch/finger in the event object.
     * @param {int} id The id to store the finger data under (usually the order the fingers were pressed)
     * @param {object} evt The event object containing finger data
     * @return finger data object
     * @inner
     */
    function createFingerData(id, evt) {
      var f = {
        start: {
          x: 0,
          y: 0
        },
        last: {
          x: 0,
          y: 0
        },
        end: {
          x: 0,
          y: 0
        }
      };
      f.start.x = f.last.x = f.end.x = evt.pageX || evt.clientX;
      f.start.y = f.last.y = f.end.y = evt.pageY || evt.clientY;
      fingerData[id] = f;
      return f;
    }

    /**
     * Updates the finger data for a particular event object
     * @param {object} evt The event object containing the touch/finger data to upadte
     * @return a finger data object.
     * @inner
     */
    function updateFingerData(evt) {
      var id = evt.identifier !== undefined ? evt.identifier : 0;
      var f = getFingerData(id);

      if (f === null) {
        f = createFingerData(id, evt);
      }

      f.last.x = f.end.x;
      f.last.y = f.end.y;

      f.end.x = evt.pageX || evt.clientX;
      f.end.y = evt.pageY || evt.clientY;

      return f;
    }

    /**
     * Returns a finger data object by its event ID.
     * Each touch event has an identifier property, which is used
     * to track repeat touches
     * @param {int} id The unique id of the finger in the sequence of touch events.
     * @return a finger data object.
     * @inner
     */
    function getFingerData(id) {
      return fingerData[id] || null;
    }


    /**
     * Sets the maximum distance swiped in the given direction.
     * If the new value is lower than the current value, the max value is not changed.
     * @param {string}  direction The direction of the swipe
     * @param {int}  distance The distance of the swipe
     * @inner
     */
    function setMaxDistance(direction, distance) {
      if(direction==NONE) return;
      distance = Math.max(distance, getMaxDistance(direction));
      maximumsMap[direction].distance = distance;
    }

    /**
     * gets the maximum distance swiped in the given direction.
     * @param {string}  direction The direction of the swipe
     * @return int  The distance of the swipe
     * @inner
     */
    function getMaxDistance(direction) {
      if (maximumsMap[direction]) return maximumsMap[direction].distance;
      return undefined;
    }

    /**
     * Creats a map of directions to maximum swiped values.
     * @return Object A dictionary of maximum values, indexed by direction.
     * @inner
     */
    function createMaximumsData() {
      var maxData = {};
      maxData[LEFT] = createMaximumVO(LEFT);
      maxData[RIGHT] = createMaximumVO(RIGHT);
      maxData[UP] = createMaximumVO(UP);
      maxData[DOWN] = createMaximumVO(DOWN);

      return maxData;
    }

    /**
     * Creates a map maximum swiped values for a given swipe direction
     * @param {string} The direction that these values will be associated with
     * @return Object Maximum values
     * @inner
     */
    function createMaximumVO(dir) {
      return {
        direction: dir,
        distance: 0
      }
    }
    function calculateDuration() {
      return endTime - startTime;
    }
    function calculateTouchesDistance(startPoint, endPoint) {
      var diffX = Math.abs(startPoint.x - endPoint.x);
      var diffY = Math.abs(startPoint.y - endPoint.y);

      return Math.round(Math.sqrt(diffX * diffX + diffY * diffY));
    }
    function calculatePinchZoom(startDistance, endDistance) {
      var percent = (endDistance / startDistance) * 1;
      return percent.toFixed(2);
    }
    function calculatePinchDirection() {
      if (pinchZoom < 1) {
        return OUT;
      } else {
        return IN;
      }
    }
    function calculateDistance(startPoint, endPoint) {
      return Math.round(Math.sqrt(Math.pow(endPoint.x - startPoint.x, 2) + Math.pow(endPoint.y - startPoint.y, 2)));
    }
    function calculateAngle(startPoint, endPoint) {
      var x = startPoint.x - endPoint.x;
      var y = endPoint.y - startPoint.y;
      var r = Math.atan2(y, x); //radians
      var angle = Math.round(r * 180 / Math.PI); //degrees

      //ensure value is positive
      if (angle < 0) {
        angle = 360 - Math.abs(angle);
      }

      return angle;
    }
    function calculateDirection(startPoint, endPoint) {

      if( comparePoints(startPoint, endPoint) ) {
        return NONE;
      }

      var angle = calculateAngle(startPoint, endPoint);

      if ((angle <= 45) && (angle >= 0)) {
        return LEFT;
      } else if ((angle <= 360) && (angle >= 315)) {
        return LEFT;
      } else if ((angle >= 135) && (angle <= 225)) {
        return RIGHT;
      } else if ((angle > 45) && (angle < 135)) {
        return DOWN;
      } else {
        return UP;
      }
    }
    function getTimeStamp() {
      var now = new Date();
      return now.getTime();
    }
    function getbounds(el) {
      el = $(el);
      var offset = el.offset();

      var bounds = {
        left: offset.left,
        right: offset.left + el.outerWidth(),
        top: offset.top,
        bottom: offset.top + el.outerHeight()
      }

      return bounds;
    }

    function isInBounds(point, bounds) {
      return (point.x > bounds.left && point.x < bounds.right && point.y > bounds.top && point.y < bounds.bottom);
    };
    function comparePoints(pointA, pointB) {
      return (pointA.x == pointB.x && pointA.y == pointB.y);
    }


  }
}));
