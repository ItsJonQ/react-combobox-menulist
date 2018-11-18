import React from "react";
import ReactDOM from "react-dom";
import createStore from "unistore";
import { connect, Provider } from "unistore/react";
import { createSpec, faker } from "@helpscout/helix";
import computeScrollIntoView from "compute-scroll-into-view";
import "./styles.css";

// Feel free to push this to 10,000, It works :)
// The delay comes from the initial mount from Codesandbox.
// After that, the interactions are buttery smooth.

// P.S. I wouldn't do 100,000. Codesandbox breaks at that point.
const ITEM_COUNT = 100;
const DATA_ATTR = "data-custom-namespace-plz-menulist-index";

//////////
// Setting up initial state stuff
//////////

const ItemSpec = createSpec({
  value: () =>
    faker.random
      .word()()
      .toLowerCase(),
  id: faker.random.uuid()
});

const initialState = {
  enableTabNavigation: true,
  items: ItemSpec.generate(ITEM_COUNT),
  previousIndex: "",
  index: "",
  previousSelectedIndex: "",
  selectedIndex: "",
  onSelect: () => undefined
};

const store = createStore(initialState);

//////////
// Actions
//////////

const focusItem = (state, event) => {
  const node = findClosestItemDOMNode(event.target);
  if (!node) return;
  const index = getIndexFromItemDOMNode(node);
  // Performance guard to prevent store from uppdating
  if (state.index === index) return;

  return {
    previousIndex: state.index,
    index: index
  };
};

const selectItemFromIndex = state => {
  const target = findItemDOMNode(state.index);
  if (target) {
    return selectItem(state, { target });
  }
};

const selectItem = (state, event) => {
  const node = event.target;
  const index = getIndexFromItemDOMNode(node);
  // Performance guard to prevent store from updating
  const itemId = getIdFromItemDOMNode(node);
  const item = state.items.find(i => i.id === itemId);
  if (!index) return;

  // Exposed Callback
  state.onSelect(item);

  return {
    previousSelectedItem: state.selectedItem,
    previousSelectedIndex: state.selectedIndex,
    selectedIndex: index,
    selectedItem: item
  };
};

const incrementUp = (state, modifier = 1) => {
  let index = parseInt(state.index, 10) - modifier;
  if (index < 0) {
    index = 0;
  }
  index = index.toString();

  // Performance guard to prevent store from uppdating
  if (index === state.index) return;

  return {
    previousIndex: state.index,
    index
  };
};

const incrementDown = (state, modifier = 1) => {
  let index = parseInt(state.index, 10) + modifier;
  // Not as performant as comparing it to state.items.length.
  // However, this method allows for on-the-fly calculations for interactions like
  // filterable lists or sub-menus
  const listSize = findItemDOMNodes().length;
  if (index >= listSize) {
    index = listSize - 1;
  }
  index = index.toString();

  // Performance guard to prevent store from uppdating
  if (index === state.index) return;

  return {
    previousIndex: state.index,
    index
  };
};

//////////
// Components
//////////

// Worst case scenario... We'll render a Functional Item component
const Item = props => {
  const itemProps = getItemProps(props, props.index);
  const { index, value } = itemProps;

  return (
    <div className="item" {...itemProps}>
      {index + 1}. {value}
      <button>Event Blocker</button>
      <input placeholder="Test to block mouse hovering" />
    </div>
  );
};

const Menu = props => {
  const { children, items, focusItem, selectItem } = props;
  // Item "hover" activation is handled by the root menu, instead of individual items.
  // This frees us up from having to bind/unbind 100s/1000s of event listeners.
  return (
    <div
      className="menu"
      onMouseMove={focusItem}
      onClick={selectItem}
      role="listbox"
    >
      {// renderProp pattern!
      children
        ? children({ items, getItemProps })
        : items.map((item, index) => (
            <Item key={item.id} {...item} index={index} />
          ))}
    </div>
  );
};

// We technically don't have to do this for this example.
// In real life scenarios, we probably would.
// So let's go with that.
const ConnectedMenu = connect(
  state => {
    return {
      items: state.items
    };
  },
  { focusItem, selectItem }
)(Menu);

/////////////////////////////////
// HERE WE GO!
// The DOM updates are done with pure vanilla Javascript that happen
// independently of the Menu/Item component render cycles.
// Even though these components don't re-render, React still needs
// to do it's diff'ing process on a bunch of things.
//
// This processing cost adds up quick when (super) fast actions are
// performed, like, scrolling + hovering over 10's/100's of items.
/////////////////////////////////
const optimizedItemRenderFromProps = ({
  previousIndex,
  index,
  previousSelectedItem,
  selectedItem
}) => {
  if (!index) return;
  // This can be abstracted to CSS classes to keep JS tidier.
  // Render focus (hover) styles
  const previousNode = findItemDOMNode(previousIndex);
  const nextNode = findItemDOMNode(index);
  if (!nextNode) return;

  // Handle the UI for focus, however it is you wish!
  if (previousNode) {
    previousNode.classList.remove("is-focus");
  }
  nextNode.classList.add("is-focus");
  scrollIntoView(nextNode);

  // Render selected (active) styles
  // Handle the UI for select/active, however it is you wish!
  const previousSelectedNode = findItemDOMNodeById(previousSelectedItem);
  if (previousSelectedNode) {
    previousSelectedNode.classList.remove("is-selected");
  }

  const selectedNode = findItemDOMNodeById(selectedItem);
  if (selectedNode) {
    selectedNode.classList.add("is-selected");
    selectedNode.parentElement.setAttribute(
      "aria-activedescendant",
      selectedNode.id
    );
  }
};

// Handle the rendering business logic with this React component.
class PerformantRenderer extends React.PureComponent {
  componentDidMount() {
    document.addEventListener("keydown", this.handleOnKeyDown);
  }
  componentWillUnmount() {
    document.removeEventListener("keydown", this.handleOnKeyDown);
  }

  handleTab = event => {
    if (!this.props.enableTabNavigation) return;
    const target = document.activeElement;
    if (!isDOMNodeValidItem(target)) return;
    event.preventDefault();
    this.props.focusItem({ target });
  };

  handleOnKeyDown = event => {
    let modifier = 1;
    if (event.shiftKey) {
      modifier = 5;
    }
    if (event.keyCode === 38) {
      event.preventDefault();
      this.props.incrementUp(modifier);
    }
    if (event.keyCode === 40) {
      event.preventDefault();
      this.props.incrementDown(modifier);
    }
    if (event.keyCode === 13) {
      event.preventDefault();
      this.props.selectItemFromIndex();
    }
    if (event.keyCode === 9) {
      this.handleTab(event);
    }
  };

  render() {
    // We'll update the DOM for every render cycle
    // It may feel "wrong"... But, this is FAR cheaper than
    // relying on React to do it.
    optimizedItemRenderFromProps(this.props);
    return null;
  }
}

const ConnectedPerformantRenderer = connect(
  state => {
    const { items, ...rest } = state;
    return rest;
  },
  {
    incrementUp,
    incrementDown,
    selectItemFromIndex,
    focusItem
  }
)(PerformantRenderer);

function MenuList(props) {
  return (
    <Provider store={store}>
      <div>
        <ConnectedMenu>{props.children}</ConnectedMenu>
        <ConnectedPerformantRenderer />
      </div>
    </Provider>
  );
}

// Exmaple of an easy way to extend and customize the UI/UX of the base MenuList
// We're going to tap into the renderProp, and build a simple Combobox UI
// where the items can be filtered.
class Combobox extends React.PureComponent {
  state = {
    inputValue: "",
    selectedItem: ""
  };

  componentDidMount() {
    store.setState({ onSelect: this.onSelect });
  }

  // You can debounce this for even more performance, if you want!
  onInputValueChange = event => {
    this.setState({
      inputValue: event.target.value
    });
  };

  onSelect = index => {
    this.setState({
      selectedItem: index
    });
  };

  filterItems = item => {
    if (!this.state.inputValue.length) return item;
    return item.value
      .toLowerCase()
      .includes(this.state.inputValue.toLowerCase());
  };

  renderItems = ({ items, getItemProps }) => {
    const itemsMarkup = items
      .filter(this.filterItems)
      .map(this.renderItemWithSearchHint);

    if (itemsMarkup.length) {
      return itemsMarkup;
    } else {
      return (
        <div>
          No results for "
          <em class="search-highlight">{this.state.inputValue}</em>"
        </div>
      );
    }
  };

  renderItemWithSearchHint = (item, index) => {
    const props = getItemProps(item, index);
    const enhancedValue = props.value.replace(
      this.state.inputValue,
      `<em class="search-highlight">${this.state.inputValue}</em>`
    );
    const markup = `${index + 1}. ${enhancedValue}`;

    return (
      <div
        {...props}
        key={props.id}
        dangerouslySetInnerHTML={{
          __html: markup
        }}
      />
    );
  };

  render() {
    return (
      <div>
        <div>Selected: {this.state.selectedItem.value}</div>
        <hr />
        <input
          value={this.state.inputValue}
          onChange={this.onInputValueChange}
          placeholder="Search..."
          style={{ position: "sticky", top: 0, zIndex: 1 }}
        />
        <MenuList>{this.renderItems}</MenuList>
      </div>
    );
  }
}

function App() {
  return (
    <div>
      <h1>A React Combobox/Menulist so peformant, it's silly</h1>
      <hr />
      Item Count: {getState().items.length}
      <hr />
      <Combobox />
    </div>
  );
}

function getState() {
  return store.getState();
}

function getItemProps(item, index) {
  const state = getState();
  return {
    ...item,
    [DATA_ATTR]: index,
    tabindex: state.enableTabNavigation ? 0 : null,
    role: "option",
    index
  };
}

function getIndexFromItemDOMNode(itemNode) {
  return itemNode && itemNode.getAttribute(DATA_ATTR);
}
function getIdFromItemDOMNode(itemNode) {
  return itemNode && itemNode.getAttribute("id");
}
function findItemDOMNode(index, envNode = document) {
  return envNode.querySelector(`[${DATA_ATTR}="${index}"]`);
}
function findItemDOMNodeById(item, envNode = document) {
  return item && item.id && envNode.getElementById(item.id);
}
function findItemDOMNodes(envNode = document) {
  return envNode.querySelectorAll(`[${DATA_ATTR}]`);
}
function findClosestItemDOMNode(node) {
  return node && node.closest && node.closest(`[${DATA_ATTR}]`);
}
function isDOMNodeValidItem(node) {
  return !!getIndexFromItemDOMNode(node);
}
// Helper function for scroll handling + keyboard
// Thanks Downshift! <3
/**
 * Scroll node into view if necessary
 * @param {HTMLElement} node the element that should scroll into view
 * @param {HTMLElement} rootNode the root element of the component
 */
function scrollIntoView(node, rootNode) {
  if (node === null) {
    return;
  }

  const actions = computeScrollIntoView(node, {
    boundary: rootNode,
    block: "nearest",
    scrollMode: "if-needed"
  });
  actions.forEach(({ el, top, left }) => {
    el.scrollTop = top;
    el.scrollLeft = left;
  });
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
