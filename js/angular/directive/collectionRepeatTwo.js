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
    for (var i = 0; i < 1000; i++) data.push(i);

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

  return function RepeatController(options) {
    var containerNode = options.containerNode;

    var data = options.data;
    var scope = options.scope;
    var scrollView = options.scrollView;
    var transclude = options.transclude;
    var keyExpression = options.keyExpression;

    var estimatedHeight = options.estimatedHeight;
    var estimatedWidth = 80;

    // TODO getEstimatedWidth getEstimatedHeight;

    var heightGetter = options.heightGetter || function(index) {
      return 60 + 2 * (index % 20);
    };
    var widthGetter = options.widthGetter || function(index) {
      return 60 + 2 * (index % 20);
    };

    var renderStartIndex = -1;
    var renderEndIndex = -1;
    var renderScrollValue = -1;
    var oldRenderStartIndex = -1;
    var oldRenderScrollValue = -1;

    var RepeatItem = setupRepeatItemPrototype();
    var itemsPool = [];
    var itemsLeaving = [];
    var itemsShownMap = {};

    var scrollWidth;
    var scrollHeight;
    var estimatedItemsPerRow;
    var itemDimensions;

    angular.element($window).on('resize', onResize);

    // INITIALIZATION
    onResize():

    function onResize() {
      scrollWidth = scrollView.__clientWidth;
      estimatedItemsPerRow = estimatedWidth ?
        Math.floor(scrollWidth / estimatedWidth) :
        1;
    }

    function getEstimatedLeft(index) {
      return (index % estimatedItemsPerRow) * estimatedWidth;
    }
    function getEstimatedTop(index) {
      return Math.floor(index / estimatedItemsPerRow) * estimatedHeight;
    }
    function getEstimatedIndex(scrollValue) {
      Math.floor(scrollValue / estimatedHeight) + Math.floor(scrollWidth / estimatedWidth);
    }

    function getActualDimensions(index) {
    }

    scrollView.options.getContentHeight = function() {
      return estimatedHeight * data.length;
    };
    scrollView.__$callback = scrollView.__callback;

    var prevScrollTop;
    scrollView.__callback = function(transformLeft, transformTop, zoom, wasResize) {
      var scrollTop = Math.max(0, Math.min(scrollView.__maxScrollTop, scrollView.__scrollTop));

      if (renderScrollValue === -1 ||
          scrollTop > renderScrollValue + estimatedHeight ||
          scrollTop < renderScrollValue - estimatedHeight) {
        render();
      }
      scrollView.__$callback(transformLeft, transformTop, zoom, wasResize);
    };

    // TODO object pool should be (items on screen) * 2
    for (i = 0; i < 60; i++) {
      itemsPool.push(new RepeatItem());
    }

    function calculateEstimatedDimensions() {
      itemDimensions.length = 0;
      var i, ii;
      // LIST VIEW: FASTER
      if (!estimatedWidth) {
        var currentLeft, currentTop;
        for (i = 0, ii = data.length; i < ii; i++) {
          itemDimensions.push({
            top: estimatedHeight * i,
            left: 0,
            width: 1,
            height: estimatedHeight,
            $estimated: true
          });
        }
      // GRID VIEW: SLOWER
      } else {
        var itemsPerRow = Math.floor(scrollView.__clientWidth / estimatedWidth);
        for (i = 0, ii = data.length; i < ii; i++) {
          itemDimensions.push({
            top: estimatedHeight * Math.floor(i / itemsPerRow),
            left: i % itemsPerRow,
            width: estimatedWidth,
            height: estimatedHeight,
            $estimated: true
          });
        }
      }
    }

    // Add rowDelta number of rows to the index. Eg if there are 3 items per row and we are
    // at index 2, it takes 6 indices to advance two rows.
    // In that case, addRowsToIndex(2, 2) == 8
    function addRowsToIndex(index, rowDelta) {
      var direction = rowDelta > 0 ? 1 : -1;
      var rect;
      var positionOfRow;
      rowDelta = Math.abs(rowDelta);
      do {
        positionOfRow = heightGetter(index);
        while ((rect = dimensions[index]) && rect.primaryPos === positionOfRow &&
               dimensions[index + direction]) {
          index += direction;
        }
      } while (rowDelta--);
      return index;
    }

    function scrollValueToIndex(scrollTop, prevScrollTop, prevIndex) {
      var estimatedStartIndex = Math.floor(scrollTop / estimatedHeight);
      var direction = scrollTop > prevScrollTop ? 1 : -1;
    }

    /*
     * render
     * current scroll value
     * scrollValue -> data index
     * Build out dimensions starting at data index, ending at renderEndIndex
     */

    function render() {
      // - Get scrollValue
      //
      // - Get height of scroll
      //
      // - Get the data index matching scrollValue
      //
      // - Calculate, starting at startIndex with a small buffer,
      //   which indices need to be displayed & their dimensions
      //
      // - Find which indices are now OUT
      //
      // - Find which indices need to be IN
      //
      // - Bring items IN
      //   - If there are any to use that were OUT, use those
      //   - Otherwise, pull from the pool if it's not empty
      //   - Otherwise, add an item to the pool
      //
      // - Cleanup all leftover OUT items
      var i, item;
      var scrollTop = scrollView.__scrollTop;
      var scrollHeight = scrollView.__clientHeight;
      var scrollWidth = scrollView.__clientWidth;

      renderStartIndex = scrollValueToIndex(scrollTop, oldRenderScrollValue, oldRenderStartIndex);

      renderStartIndex = Math.floor(scrollTop / estimatedHeight);
      renderEndIndex = renderStartIndex + Math.ceil(scrollHeight / estimatedHeight);

      // Buffer of two on each end
      renderStartIndex = Math.max(0, renderStartIndex - 2);
      renderEndIndex = Math.min(data.length, renderEndIndex);
      renderScrollValue = renderStartIndex * estimatedHeight;

      for (i in itemsShownMap) {
        if (i < renderStartIndex || i > renderEndIndex) {
          item = itemsShownMap[i];
          delete itemsShownMap[i];
          item.onLeave();
          itemsLeaving.push(item);
        }
      }
      for (i = renderStartIndex; i <= renderEndIndex; i++) {
        if (!itemsShownMap[i]) {
          itemsShownMap[i] = item = getNextItem();
          item.onEnter(i);
          item.node.style[ionic.CSS.TRANSFORM] = 'translate3d(0,' +
            (renderScrollValue + (i - renderStartIndex) * estimatedHeight) + 'px,0)';
          item.node.style.height = estimatedHeight + 'px';
          item.node.style.width = scrollWidth + 'px';
        }
      }
      while (itemsLeaving.length) {
        item = itemsLeaving.pop();
        item.onLeave();
        itemsPool.push(item);
      }

      oldRenderScrollValue = renderScrollValue;
      oldRenderStartIndex = renderStartIndex;
    }

    function getNextItem() {
      if (itemsLeaving.length)
        return itemsLeaving.pop();
      else if (itemsPool.length)
        return itemsPool.pop();
      return new RepeatItem();
    }

    function setupRepeatItemPrototype() {
      function RepeatItem() {
        var self = this;
        this.scope = scope.$new();
        transclude(this.scope, function(clone) {
          self.element = clone;
          self.node = clone[0];
          self.onLeave();
          containerNode.appendChild(self.node);
        });
      }
      RepeatItem.prototype = {
        onLeave: function() {
          // Lets the default transform styles take over to hide the element
          this.node.style[ionic.CSS.TRANSFORM] = 'translate3d(-9999px, -9999px, 0)';
          ionic.Utils.disconnectScope(this.scope);
        },
        onEnter: function(index) {
          if (index > data.length) return;
          if (this.index === index && this.scope[keyExpression] === value) return;
          var value = data[index];

          ionic.Utils.reconnectScope(this.scope);

          this.index = this.scope.$index = index;
          this.scope[keyExpression] = value;
          this.scope.$first = (index === 0);
          this.scope.$last = (index === (data.length - 1));
          this.scope.$middle = !(this.scope.$first || this.scope.$last);
          this.scope.$odd = !(this.scope.$even = (index&1) === 0);

          //We changed the scope, so digest if needed
          if (!$rootScope.$$phase) {
            try {
              this.scope.$digest();
            } catch(e){}
            this.shouldRefreshImages && refreshImages(this.images);
          }
        }
      };
      return RepeatItem;
    }

  };

}
})();
