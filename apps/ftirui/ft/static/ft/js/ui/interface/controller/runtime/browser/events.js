import * as treeEvents from '../../../../workspace/browser/treeEvents.js';

/**
 * Attach browser tree event handlers (selection, toggles, edit actions).
 *
 * @param {object} ctx Runtime context from workspaceRuntime.
 * @returns {{ detach(): void }}
 */
export function attachBrowserEvents(ctx = {}) {
  const {
    panelDom,
    isPanelPinned,
    focusPanelById,
    focusSectionById,
    renderBrowser,
    toggleSectionCollapsedState,
    togglePanelCollapsedState,
    toggleSectionVisibility,
    toggleGraphVisibility,
    addGraphToSection,
    pushHistory,
    createSection,
    queueSectionRename,
    persist,
    updateHistoryButtons,
    deleteSectionInteractive,
    deleteGraphInteractive,
    requestGraphFileBrowse,
    startSectionRename,
    startPanelRename = () => {},
    chipPanelsBridge,
    duplicatePanel,
    duplicateSection
  } = ctx;

  const tree = panelDom?.tree;
  if (!tree) {
    return { detach() {} };
  }

  const handleFocusIn = () => {
    if (isPanelPinned()) return;
    panelDom.root?.classList.add('peeking');
    panelDom.root?.classList.add('is-active');
  };

  const handleFocusOut = (evt) => {
    if (isPanelPinned()) return;
    if (panelDom.root && !panelDom.root.contains(evt.relatedTarget)) {
      panelDom.root.classList.remove('is-active');
      panelDom.root.classList.remove('peeking');
    }
  };

  tree.addEventListener('focusin', handleFocusIn);
  tree.addEventListener('focusout', handleFocusOut);

  treeEvents.attach(tree, {
    onSelectPanel: (panelId) => {
      focusPanelById(panelId, { scrollBrowser: false });
      chipPanelsBridge.onPanelSelected(panelId);
      return false;
    },
    onSelectSection: (sectionId) => {
      focusSectionById(sectionId, { scrollBrowser: false });
      return false;
    },
    onStateChanged: renderBrowser,
    toggleSectionCollapsed: (sectionId) => {
      toggleSectionCollapsedState(sectionId);
      return false;
    },
    togglePanelCollapsed: (panelId) => {
      togglePanelCollapsedState(panelId);
      return false;
    },
    toggleSectionVisibility: (sectionId) => {
      toggleSectionVisibility(sectionId);
      return false;
    },
    togglePanelVisibility: (panelId) => {
      toggleGraphVisibility(panelId);
      return false;
    },
    addGraphToSection: (sectionId) => {
      addGraphToSection(sectionId);
      return false;
    },
    addSubSection: (sectionId) => {
      pushHistory();
      const section = createSection(null, { parentId: sectionId });
      if (section?.id) {
        queueSectionRename(section.id);
      }
      renderBrowser();
      persist();
      updateHistoryButtons();
      return false;
    },
    deleteSection: (sectionId) => {
      deleteSectionInteractive(sectionId);
      return false;
    },
    deletePanel: (panelId) => {
      deleteGraphInteractive(panelId);
      return false;
    },
    browsePanel: (panelId) => {
      requestGraphFileBrowse(panelId);
      return false;
    },
    duplicatePanel: (panelId) => {
      return duplicatePanel?.(panelId) ?? false;
    },
    duplicateSection: (sectionId) => {
      return duplicateSection?.(sectionId) ?? false;
    },
    startSectionRename: (sectionId, nameEl, opts) => {
      startSectionRename(sectionId, nameEl, opts);
      return false;
    },
    startPanelRename: (panelId, nameEl, opts) => {
      startPanelRename(panelId, nameEl, opts);
      return false;
    }
  });

  return {
    detach() {
      tree.removeEventListener('focusin', handleFocusIn);
      tree.removeEventListener('focusout', handleFocusOut);
      treeEvents.detach(tree);
    }
  };
}
