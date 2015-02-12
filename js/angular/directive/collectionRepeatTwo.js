(function() {
IonicModule
.directive('collectionRepeat', CollectionRepeatDirective)
.factory('colRepeatManager', RepeatManagerFactory)

function CollectionRepeatDirective(colRepeatManager) {
  return {
    restrict: 'A',
    transclude: 'element',
    $$tlb: true,
    require: '^$ionicScroll',
    link: postLink
  };

  function postLink(scope, element, attr, scrollCtrl, transclude) {
    var node = element[0];
    var container = angular.element('<div class="collection-repeat-container">');
    node.parentNode.replaceChild(container[0], node);

    var data = [];
    for (var i = 0; i < 10000; i++) data.push(i);

    var repeatCtrl = new colRepeatManager({
      scope: scope,
      containerNode: container[0],
      data: data,
      scrollView: scrollCtrl.scrollView,
      transclude: transclude,
      keyExpression: 'item',
      estimatedHeight: 100
    });
  }

}

RepeatManagerFactory.$inject = ['$rootScope', '$window'];
function RepeatManagerFactory($rootScope, $window) {
  var EMPTY_DIMENSION = { left: 0, top: 0, height: 0, width: 0, bottom: 0, right: 0 };

  return function RepeatController(options) {
    var containerNode = options.containerNode;

    var data = options.data;
    var scope = options.scope;
    var scrollView = options.scrollView;
    var transclude = options.transclude;
    var keyExpression = options.keyExpression;
    var estimatedHeight = 50;
    var estimatedWidth = 50;

    var isGridView = !!estimatedWidth;

    // TODO getEstimatedWidth getEstimatedHeight;

    var heightGetter = options.heightGetter || function(index) {
      return 60;
    };
    var widthGetter = options.widthGetter || function(index) {
      return 60;
    };

    var renderStartIndex = -1;
    var renderEndIndex = -1;
    var oldRenderStartIndex = -1;
    var oldScrollTop = -1;
    var renderBottomBoundary = -1;
    var renderTopBoundary = -1;

    var itemsPool = [];
    var itemsLeaving = [];
    var itemsShownMap = {};

    var itemDimensions = [];
    var itemDimensionsIndex;
    resetDimensionsPool();

    var estimatedItemsPerRow;

    angular.element($window).on('resize', onResize);

    function onResize() {
      // TODO are item dimensions flexible?
      itemDimensionsIndex = 0;
      estimatedItemsPerRow = isGridView ?
        Math.max(1, Math.floor(scrollView.__clientWidth / estimatedWidth)) :
        1;
    }

    var getEstimatedLeft;
    var getEstimatedTop;
    var getEstimatedIndex;
    var calculateDimensions;
    if (isGridView) {

      getEstimatedLeft = function(index) {
        return (index % estimatedItemsPerRow) * estimatedWidth;
      };
      getEstimatedTop = function(index) {
        return index * Math.floor(estimatedHeight / estimatedItemsPerRow);
      };
      getEstimatedIndex = function(scrollValue) {
        return Math.floor(scrollValue / estimatedHeight) * estimatedItemsPerRow;
      };

      calculateDimensions = function(index) {
        var i, prevDimension, dimension;
        for (i = itemDimensionsIndex; i <= index && (dimension = itemDimensions[i]); i++) {
          prevDimension = itemDimensions[i - 1] || EMPTY_DIMENSION;
          dimension.width = Math.min(widthGetter(i), scrollView.__clientWidth);
          dimension.left = prevDimension.right;

          if (i === 0 || dimension.left + dimension.width > scrollView.__clientWidth) {
            dimension.rowStartIndex = i;
            dimension.left = 0;
            dimension.height = heightGetter(i);
            dimension.top = prevDimension.bottom;
          } else {
            dimension.rowStartIndex = prevDimension.rowStartIndex;
            dimension.height = prevDimension.height;
            dimension.top = prevDimension.top;
          }
          dimension.bottom = dimension.top + dimension.height;
          dimension.right = dimension.left + dimension.width;
        }
      };

    } else {

      getEstimatedLeft = function() {
        return 0;
      }
      getEstimatedTop = function(index) {
        return index * estimatedHeight;
      };
      getEstimatedIndex = function(scrollValue) {
        return Math.floor(scrollValue / estimatedHeight);
      };
      calculateDimensions = function(index) {
        var i, prevDimension, dimension;
        for (i = itemDimensionsIndex; i <= index && (dimension = itemDimensions[i]); i++) {
          prevDimension = itemDimensions[i - 1] || EMPTY_DIMENSION;
          dimension.height = heightGetter(i);
          dimension.width = scrollView.__clientWidth;
          dimension.top = prevDimension.bottom;
          dimension.left = 0;
          dimension.right = dimension.left + dimension.width;
          dimension.bottom = dimension.top + dimension.height;
        }
      }

    }

    // Get the dimensions at index. {width, height, left, top}.
    // We start with no dimensions calculated, then any time dimensions are asked for at an
    // index we calculate dimensions up to there.
    var scrollViewSetDimensions = function() {
      var start = getNow();
      scrollView.setDimensions(null, null, null, scrollView.options.getContentHeight(), true);
    };
    var debouncedScrollViewSetDimensions = ionic.debounce(scrollViewSetDimensions, 75, true);
    function getDimensions(index) {
      index = Math.min(index, data.length - 1);

      if (itemDimensionsIndex < index) {
        if (index > data.length * 0.9) {
          // By this point, we're near the bottom of the list and need to calculate everything
          // or the scrollbar will look wrong
          calculateDimensions(data.length - 1);
          scrollViewSetDimensions();
          itemDimensionsIndex = data.length - 1;
        } else {
          calculateDimensions(index);
          itemDimensionsIndex = index;
          debouncedScrollViewSetDimensions();
        }

      }
      return itemDimensions[index];
    }

    function resetDimensionsPool() {
      // Make sure itemDimensions has as many items as data.length.
      // This is to be sure we don't have to allocate objects while scrolling.
      for (i = itemDimensions.length, len = data.length; i < len; i++) {
        itemDimensions.push({ left: 0, top: 0, width: 0, height: 0, top: 0, bottom: 0 });
      }
      itemDimensionsIndex = 0;
    }

    scrollView.options.getContentHeight = function() {
      return (itemDimensions[itemDimensionsIndex].bottom || 0) +
        getEstimatedTop(data.length - itemDimensionsIndex - 1);
    };
    scrollView.__$callback = scrollView.__callback;

    var prevScrollTop;
    scrollView.__callback = function(transformLeft, transformTop, zoom, wasResize) {
      var scrollTop = Math.max(0, Math.min(scrollView.__maxScrollTop, scrollView.__scrollTop));

      if (renderStartIndex === -1 ||
          scrollTop + scrollView.__clientHeight > renderBottomBoundary ||
          scrollTop < renderTopBoundary) {
        render();
      }
      scrollView.__$callback(transformLeft, transformTop, zoom, wasResize);
    };

    // TODO object pool should be (items on screen) * 2
    for (i = 0; i < 60; i++) {
      itemsPool.push(new RepeatItem());
    }

    function scrollValueToIndex(scrollTop, prevScrollTop, prevIndex) {
      if (prevIndex === -1) return 0;
      var dim;
      var i, len;
      //scrolling down
      if (scrollTop >= prevScrollTop) {
        for (i = prevIndex, len = data.length; i < len; i++) {
          dim = getDimensions(i);
          if (dim.bottom >= scrollTop) return i;
        }
      //scrolling up
      } else {
        for (i = prevIndex; i >= 0; i--) {
          dim = getDimensions(i);
          if (dim.top <= scrollTop) {
            return isGridView ? dim.rowStartIndex : i;
          }
        }
      }
      return i;
    }

    /*
     * render
     * current scroll value
     * scrollValue -> data index
     * Build out dimensions starting at data index, ending at renderEndIndex
     */

    var totalPlacementTime = 0;
    var totalCalcTime = 0;
    var totalRenderTime = 0;
    var totalRenders = 0;

    var getNow = window.performance && window.performance.now ?
      function() { return window.performance.now(); } :
      function() { return +Date.now(); };
    function render() {
      if (!render.firstDone) {
        onResize();
        render.firstDone = true;
      }
      var i;
      var item;
      var dim;
      var scrollTop = scrollView.__scrollTop;
      var scrollViewBottom = scrollTop + scrollView.__clientHeight;

      var startTime = getNow();

      // Calculate as many dim as we estimate we'll need
      getDimensions( getEstimatedIndex(scrollViewBottom) * 2 );

      renderStartIndex = scrollValueToIndex(scrollTop, oldScrollTop, oldRenderStartIndex);
      renderStartIndex = Math.min(Math.max(0, renderStartIndex), data.length - 1);

      renderEndIndex = renderStartIndex + 1;
      while (renderEndIndex < data.length - 1 &&
             getDimensions(renderEndIndex).bottom <= scrollViewBottom) {
        renderEndIndex++;
      }
      if (isGridView) {
        var top = getDimensions(renderEndIndex).top;
        while (renderEndIndex < data.length - 1 && getDimensions(renderEndIndex + 1).top === top) {
          renderEndIndex++;
        }
      }
      renderEndIndex = Math.min(data.length - 1, renderEndIndex);

      renderTopBoundary = getDimensions(renderStartIndex).top;
      renderBottomBoundary = getDimensions(renderEndIndex).bottom;

      var calcEndTime = getNow();
      totalCalcTime += (calcEndTime - startTime);

      var renderStartTime = getNow();

      for (i in itemsShownMap) {
        if (+i < renderStartIndex || +i > renderEndIndex) {
          item = itemsShownMap[i];
          delete itemsShownMap[i];
          itemsLeaving.push(item);
        }
      }

      for (i = renderStartIndex; i <= renderEndIndex; i++) {

        if (!itemsShownMap[i]) {
          itemsShownMap[i] = item = getNextItem();
          dim = itemDimensions[i];
          var value = data[i];

          item.scope.$index = i;
          item.scope[keyExpression] = value;
          item.scope.$first = (i === 0);
          item.scope.$last = (i === (data.length - 1));
          item.scope.$middle = !(item.scope.$first || item.scope.$last);
          item.scope.$odd = !(item.scope.$even = (i&1) === 0);

          //We changed the scope, so digest if needed
          if (item.scope.$$disconnected) ionic.Utils.reconnectScope(item.scope);
          if (!$rootScope.$$phase) item.scope.$digest();

          if (item.left !== dim.left || item.top !== dim.top) {
            item.node.style[ionic.CSS.TRANSFORM] = 'translate3d(' + dim.left + 'px,' +
              dim.top + 'px,0)';
            item.left = dim.left;
            item.top = dim.top;
          }
          if (item.width !== dim.width) {
            item.node.style.width = dim.width + 'px';
            item.width = dim.width;
          }
          if (item.height !== dim.height) {
            item.node.style.height = dim.height + 'px';
            item.height = dim.height;
          }
        }

      }

      while (itemsLeaving.length) {
        item = itemsLeaving.pop();
        item.node.style[ionic.CSS.TRANSFORM] = 'translate3d(-9999px, -9999px, 0)';
        ionic.Utils.disconnectScope(item.scope);
        item.left = item.top = null;
        itemsPool.push(item);
      }
      var renderEndTime = getNow();
      totalPlacementTime += renderEndTime - renderStartTime;
      totalRenderTime += renderEndTime - startTime;
      totalRenders++;

      oldScrollTop = scrollTop;
      oldRenderStartIndex = renderStartIndex;

      if (!render.reset) {
        totalCalcTime = totalPlacementTime = totalRenderTime = totalRenders = 0;
        render.reset = true;
      }
    }
    function out(n) {
      return Math.round(n * 10000)/10000;
    }
    window.outputTimes = function() {
      return 'RENDER AVERAGES (ms)<br>- Node placement time: ' + out(totalPlacementTime / totalRenders) + '<br>- Dimension calculation time: ' + out(totalCalcTime / totalRenders) + '<br>- Total render time: ' + out(totalRenderTime / totalRenders);
    };

    function getNextItem() {
      if (itemsLeaving.length)
        return itemsLeaving.pop();
      else if (itemsPool.length)
        return itemsPool.pop();
      return new RepeatItem();
    }

    function RepeatItem() {
      var self = this;
      this.scope = scope.$new();
      transclude(this.scope, function(clone) {
        self.element = clone;
        self.node = clone[0];
        self.node.style[ionic.CSS.TRANSFORM] = 'translate3d(-9999px,-9999px,0)';
        ionic.Utils.disconnectScope(self.scope);
        containerNode.appendChild(self.node);
      });
    }

  };

}
})();
