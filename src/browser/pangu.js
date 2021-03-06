const { Pangu } = require('../shared/core');

function once(func) {
  let executed = false;
  return () => {
    if (executed) {
      return;
    }
    const self = this;
    executed = true;
    func.apply(self, arguments);
  };
}

function debounce(func, delay, mustRunDelay) {
  let timer = null;
  let startTime = null;
  return () => {
    const self = this;
    const args = arguments;
    const currentTime = +new Date();

    clearTimeout(timer);

    if (!startTime) {
      startTime = currentTime;
    }

    if (currentTime - startTime >= mustRunDelay) {
      func.apply(self, args);
      startTime = currentTime;
    } else {
      timer = setTimeout(() => {
        func.apply(self, args);
      }, delay);
    }
  };
}

// https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType

class BrowserPangu extends Pangu {
  constructor() {
    super();

    this.blockTags = /^(div|p|h1|h2|h3|h4|h5|h6)$/i;
    this.ignoredTags = /^(script|code|pre|textarea)$/i;
    this.presentationalTags = /^(b|code|del|em|i|s|strong|kbd)$/i;
    this.spaceLikeTags = /^(br|hr|i|img|pangu)$/i;
    this.spaceSensitiveTags = /^(a|del|pre|s|strike|u)$/i;

    this.isAutoSpacingPageExecuted = false;

    // TODO
    // this.ignoredTags adds iframe|pangu
    // this.ignoreClasses
    // this.ignoreAttributes
  }

  isContentEditable(node) {
    return ((node.isContentEditable) || (node.getAttribute && node.getAttribute('g_editable') === 'true'));
  }

  isSpecificTag(node, tagRegex) {
    return (node && node.nodeName && node.nodeName.search(tagRegex) >= 0);
  }

  isInsideSpecificTag(node, tagRegex, checkCurrent = false) {
    let currentNode = node;
    if (checkCurrent) {
      if (this.isSpecificTag(currentNode, tagRegex)) {
        return true;
      }
    }
    while (currentNode.parentNode) {
      currentNode = currentNode.parentNode;
      if (this.isSpecificTag(currentNode, tagRegex)) {
        return true;
      }
    }
    return false;
  }

  canIgnoreNode(node) {
    let currentNode = node;
    if (currentNode && (this.isSpecificTag(currentNode, this.ignoredTags) || this.isContentEditable(currentNode))) {
      return true;
    }
    while (currentNode.parentNode) {
      currentNode = currentNode.parentNode;
      if (currentNode && (this.isSpecificTag(currentNode, this.ignoredTags) || this.isContentEditable(currentNode))) {
        return true;
      }
    }
    return false;
  }

  isFirstTextChild(parentNode, targetNode) {
    const { childNodes } = parentNode;

    // ???????????????????????? text ??? node
    for (let i = 0; i < childNodes.length; i++) {
      const childNode = childNodes[i];
      if (childNode.nodeType !== Node.COMMENT_NODE && childNode.textContent) {
        return childNode === targetNode;
      }
    }
    return false;
  }

  isLastTextChild(parentNode, targetNode) {
    const { childNodes } = parentNode;

    // ?????????????????????????????? text ??? node
    for (let i = childNodes.length - 1; i > -1; i--) {
      const childNode = childNodes[i];
      if (childNode.nodeType !== Node.COMMENT_NODE && childNode.textContent) {
        return childNode === targetNode;
      }
    }
    return false;
  }

  spacingNodeByXPath(xPathQuery, contextNode) {
    if (!(contextNode instanceof Node) || (contextNode instanceof DocumentFragment)) {
      return;
    }

    // ?????? xPathQuery ????????? text() ????????????????????? nodes ?????? text ????????? DOM element
    // snapshotLength ????????? XPathResult.ORDERED_NODE_SNAPSHOT_TYPE ??????
    // https://developer.mozilla.org/en-US/docs/DOM/document.evaluate
    // https://developer.mozilla.org/en-US/docs/Web/API/XPathResult
    const textNodes = document.evaluate(xPathQuery, contextNode, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

    let currentTextNode;
    let nextTextNode;

    // ????????????????????????????????????????????????????????????
    for (let i = textNodes.snapshotLength - 1; i > -1; --i) {
      currentTextNode = textNodes.snapshotItem(i);

      if (this.isSpecificTag(currentTextNode.parentNode, this.presentationalTags) && !this.isInsideSpecificTag(currentTextNode.parentNode, this.ignoredTags)) {
        const elementNode = currentTextNode.parentNode;

        if (elementNode.previousSibling) {
          const { previousSibling } = elementNode;
          if (previousSibling.nodeType === Node.TEXT_NODE) {
            const testText = previousSibling.data.substr(-1) + currentTextNode.data.toString().charAt(0);
            const testNewText = this.spacing(testText);
            if (testText !== testNewText) {
              previousSibling.data = `${previousSibling.data} `;
            }
          }
        }

        if (elementNode.nextSibling) {
          const { nextSibling } = elementNode;
          if (nextSibling.nodeType === Node.TEXT_NODE) {
            const testText = currentTextNode.data.substr(-1) + nextSibling.data.toString().charAt(0);
            const testNewText = this.spacing(testText);
            if (testText !== testNewText) {
              nextSibling.data = ` ${nextSibling.data}`;
            }
          }
        }
      }

      if (this.canIgnoreNode(currentTextNode)) {
        nextTextNode = currentTextNode;
        continue;
      }

      const newText = this.spacing(currentTextNode.data);
      if (currentTextNode.data !== newText) {
        currentTextNode.data = newText;
      }

      // ??????????????? <tag> ????????????
      if (nextTextNode) {
        // TODO
        // ????????????????????????????????????????????? node ????????? <br>
        // ???????????????????????????????????????
        if (currentTextNode.nextSibling && currentTextNode.nextSibling.nodeName.search(this.spaceLikeTags) >= 0) {
          nextTextNode = currentTextNode;
          continue;
        }

        // currentTextNode ?????????????????? + nextTextNode ???????????????
        const testText = currentTextNode.data.toString().substr(-1) + nextTextNode.data.toString().substr(0, 1);
        const testNewText = this.spacing(testText);
        if (testNewText !== testText) {
          // ????????? nextTextNode ??? parent node
          // ???????????? spaceSensitiveTags
          // ?????? nextTextNode ?????????????????? text child
          // ????????????????????? nextTextNode ?????????
          let nextNode = nextTextNode;
          while (nextNode.parentNode && nextNode.nodeName.search(this.spaceSensitiveTags) === -1 && this.isFirstTextChild(nextNode.parentNode, nextNode)) {
            nextNode = nextNode.parentNode;
          }

          let currentNode = currentTextNode;
          while (currentNode.parentNode && currentNode.nodeName.search(this.spaceSensitiveTags) === -1 && this.isLastTextChild(currentNode.parentNode, currentNode)) {
            currentNode = currentNode.parentNode;
          }

          if (currentNode.nextSibling) {
            if (currentNode.nextSibling.nodeName.search(this.spaceLikeTags) >= 0) {
              nextTextNode = currentTextNode;
              continue;
            }
          }

          if (currentNode.nodeName.search(this.blockTags) === -1) {
            if (nextNode.nodeName.search(this.spaceSensitiveTags) === -1) {
              if ((nextNode.nodeName.search(this.ignoredTags) === -1) && (nextNode.nodeName.search(this.blockTags) === -1)) {
                if (nextTextNode.previousSibling) {
                  if (nextTextNode.previousSibling.nodeName.search(this.spaceLikeTags) === -1) {
                    nextTextNode.data = ` ${nextTextNode.data}`;
                  }
                } else {
                  // dirty hack
                  if (!this.canIgnoreNode(nextTextNode)) {
                    nextTextNode.data = ` ${nextTextNode.data}`;
                  }
                }
              }
            } else if (currentNode.nodeName.search(this.spaceSensitiveTags) === -1) {
              currentTextNode.data = `${currentTextNode.data} `;
            } else {
              const panguSpace = document.createElement('pangu');
              panguSpace.innerHTML = ' ';

              // ????????????????????????
              if (nextNode.previousSibling) {
                if (nextNode.previousSibling.nodeName.search(this.spaceLikeTags) === -1) {
                  nextNode.parentNode.insertBefore(panguSpace, nextNode);
                }
              } else {
                nextNode.parentNode.insertBefore(panguSpace, nextNode);
              }

              // TODO
              // ????????????????????????????????????????????? <li>?????????????????????
              // ???????????????????????????????????????????????????
              if (!panguSpace.previousElementSibling) {
                if (panguSpace.parentNode) {
                  panguSpace.parentNode.removeChild(panguSpace);
                }
              }
            }
          }
        }
      }

      nextTextNode = currentTextNode;
    }
  }

  spacingNode(contextNode) {
    let xPathQuery = './/*/text()[normalize-space(.)]';
    if (contextNode.children && contextNode.children.length === 0) {
      xPathQuery = './/text()[normalize-space(.)]';
    }
    this.spacingNodeByXPath(xPathQuery, contextNode);
  }

  spacingElementById(idName) {
    const xPathQuery = `id("${idName}")//text()`;
    this.spacingNodeByXPath(xPathQuery, document);
  }

  spacingElementByClassName(className) {
    const xPathQuery = `//*[contains(concat(" ", normalize-space(@class), " "), "${className}")]//text()`;
    this.spacingNodeByXPath(xPathQuery, document);
  }

  spacingElementByTagName(tagName) {
    const xPathQuery = `//${tagName}//text()`;
    this.spacingNodeByXPath(xPathQuery, document);
  }

  spacingPageTitle() {
    const xPathQuery = '/html/head/title/text()';
    this.spacingNodeByXPath(xPathQuery, document);
  }

  spacingPageBody() {
    // // >> ?????????????????????
    // . >> ????????????
    // .. >> ?????????
    // [] >> ??????
    // text() >> ?????????????????????????????? hello ?????? <tag>hello</tag>
    // https://www.w3schools.com/xml/xpath_syntax.asp
    //
    // [@contenteditable]
    // ?????? contenteditable ???????????????
    //
    // normalize-space(.)
    // ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????
    // https://developer.mozilla.org/en-US/docs/Web/XPath/Functions/normalize-space
    //
    // name(..)
    // ??????????????????
    // https://developer.mozilla.org/en-US/docs/Web/XPath/Functions/name
    //
    // translate(string, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz")
    // ??? string ???????????????????????? XML ??? case-sensitive ???
    // https://developer.mozilla.org/en-US/docs/Web/XPath/Functions/translate
    //
    // 1. ?????? <title>
    // 2. ?????? <body> ???????????????
    // 3. ?????? contentEditable ?????????
    // 4. ??????????????????????????? <script> ??? <style>
    //
    // ?????????????????? query ???????????????????????? text ?????????
    let xPathQuery = '/html/body//*/text()[normalize-space(.)]';
    ['script', 'style', 'textarea'].forEach((tag) => {
      // ?????????????????? tag ???????????????????????? tag
      // ????????????????????? .. ????????????
      // ex: [translate(name(..), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz") != "script"]
      xPathQuery = `${xPathQuery}[translate(name(..),"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz")!="${tag}"]`;
    });
    this.spacingNodeByXPath(xPathQuery, document);
  }

  // TODO: ?????? callback ??? promise
  spacingPage() {
    this.spacingPageTitle();
    this.spacingPageBody();
  }

  autoSpacingPage(pageDelay = 1000, nodeDelay = 500, nodeMaxWait = 2000) {
    if (!(document.body instanceof Node)) {
      return;
    }

    if (this.isAutoSpacingPageExecuted) {
      return;
    }
    this.isAutoSpacingPageExecuted = true;

    const self = this;

    const onceSpacingPage = once(() => {
      self.spacingPage();
    });

    // TODO
    // this is a dirty hack for https://github.com/vinta/pangu.js/issues/117
    const videos = document.getElementsByTagName('video');
    if (videos.length === 0) {
      setTimeout(() => {
        onceSpacingPage();
      }, pageDelay);
    } else {
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        if (video.readyState === 4) {
          setTimeout(() => {
            onceSpacingPage();
          }, 3000);
          break;
        }
        video.addEventListener('loadeddata', () => {
          setTimeout(() => {
            onceSpacingPage();
          }, 4000);
        });
      }
    }

    const queue = [];

    // it's possible that multiple workers process the queue at the same time
    const debouncedSpacingNodes = debounce(() => {
      // a single node could be very big which contains a lot of child nodes
      while (queue.length) {
        const node = queue.shift();
        if (node) {
          self.spacingNode(node);
        }
      }
    }, nodeDelay, {'maxWait': nodeMaxWait});

    // https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
    const mutationObserver = new MutationObserver((mutations, observer) => {
      // Element: https://developer.mozilla.org/en-US/docs/Web/API/Element
      // Text: https://developer.mozilla.org/en-US/docs/Web/API/Text
      mutations.forEach((mutation) => {
        switch (mutation.type) { /* eslint-disable indent */
          case 'childList':
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                queue.push(node);
              } else if (node.nodeType === Node.TEXT_NODE) {
                queue.push(node.parentNode);
              }
            });
            break;
          case 'characterData':
            const { target: node } = mutation;
            if (node.nodeType === Node.TEXT_NODE) {
              queue.push(node.parentNode);
            }
            break;
          default:
            break;
        }
      });

      debouncedSpacingNodes();
    });
    mutationObserver.observe(document.body, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  }
}

const pangu = new BrowserPangu();

module.exports = pangu;
module.exports.default = pangu;
module.exports.Pangu = BrowserPangu;
