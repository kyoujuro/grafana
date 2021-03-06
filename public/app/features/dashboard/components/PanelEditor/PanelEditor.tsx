import React, { PureComponent } from 'react';
import { connect, MapDispatchToProps, MapStateToProps } from 'react-redux';
import AutoSizer from 'react-virtualized-auto-sizer';
import { css, cx } from 'emotion';
import { Unsubscribable } from 'rxjs';

import { FieldConfigSource, GrafanaTheme, PanelPlugin } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Button, HorizontalGroup, Icon, RadioButtonGroup, stylesFactory } from '@grafana/ui';

import config from 'app/core/config';
import { appEvents } from 'app/core/core';
import { calculatePanelSize } from './utils';

import { PanelEditorTabs } from './PanelEditorTabs';
import { DashNavTimeControls } from '../DashNav/DashNavTimeControls';
import { OptionsPaneContent } from './OptionsPaneContent';
import { DashNavButton } from 'app/features/dashboard/components/DashNav/DashNavButton';
import { SubMenuItems } from 'app/features/dashboard/components/SubMenu/SubMenuItems';
import { BackButton } from 'app/core/components/BackButton/BackButton';
import { SplitPaneWrapper } from 'app/core/components/SplitPaneWrapper/SplitPaneWrapper';
import { SaveDashboardModalProxy } from '../SaveDashboard/SaveDashboardModalProxy';
import { DashboardPanel } from '../../dashgrid/DashboardPanel';

import { initPanelEditor, panelEditorCleanUp, updatePanelEditorUIState } from './state/actions';

import { updateTimeZoneForSession } from 'app/features/profile/state/reducers';
import { updateLocation } from 'app/core/reducers/location';
import { PanelEditorUIState, setDiscardChanges } from './state/reducers';

import { getPanelEditorTabs } from './state/selectors';
import { getPanelStateById } from '../../state/selectors';
import { getVariables } from 'app/features/variables/state/selectors';

import { CoreEvents, LocationState, StoreState } from 'app/types';
import { DisplayMode, displayModes, PanelEditorTab } from './types';
import { VariableModel } from 'app/features/variables/types';
import { DashboardModel, PanelModel } from '../../state';

interface OwnProps {
  dashboard: DashboardModel;
  sourcePanel: PanelModel;
}

interface ConnectedProps {
  location: LocationState;
  plugin?: PanelPlugin;
  panel: PanelModel;
  initDone: boolean;
  tabs: PanelEditorTab[];
  uiState: PanelEditorUIState;
  variables: VariableModel[];
}

interface DispatchProps {
  updateLocation: typeof updateLocation;
  initPanelEditor: typeof initPanelEditor;
  panelEditorCleanUp: typeof panelEditorCleanUp;
  setDiscardChanges: typeof setDiscardChanges;
  updatePanelEditorUIState: typeof updatePanelEditorUIState;
  updateTimeZoneForSession: typeof updateTimeZoneForSession;
}

type Props = OwnProps & ConnectedProps & DispatchProps;

export class PanelEditorUnconnected extends PureComponent<Props> {
  querySubscription: Unsubscribable;

  componentDidMount() {
    this.props.initPanelEditor(this.props.sourcePanel, this.props.dashboard);
  }
  componentWillUnmount() {
    this.props.panelEditorCleanUp();
  }

  onPanelExit = () => {
    this.props.updateLocation({
      query: { editPanel: null, tab: null },
      partial: true,
    });
  };

  onDiscard = () => {
    this.props.setDiscardChanges(true);
    this.props.updateLocation({
      query: { editPanel: null, tab: null },
      partial: true,
    });
  };

  onOpenDashboardSettings = () => {
    this.props.updateLocation({ query: { editview: 'settings' }, partial: true });
  };

  onSaveDashboard = () => {
    appEvents.emit(CoreEvents.showModalReact, {
      component: SaveDashboardModalProxy,
      props: { dashboard: this.props.dashboard },
    });
  };

  onChangeTab = (tab: PanelEditorTab) => {
    this.props.updateLocation({ query: { tab: tab.id }, partial: true });
  };

  onFieldConfigChange = (config: FieldConfigSource) => {
    const { panel } = this.props;

    panel.updateFieldConfig({
      ...config,
    });
    this.forceUpdate();
  };

  onPanelOptionsChanged = (options: any) => {
    this.props.panel.updateOptions(options);
    this.forceUpdate();
  };

  onPanelConfigChanged = (configKey: string, value: any) => {
    // @ts-ignore
    this.props.panel[configKey] = value;
    this.props.panel.render();
    this.forceUpdate();
  };

  onDisplayModeChange = (mode: DisplayMode) => {
    const { updatePanelEditorUIState } = this.props;
    updatePanelEditorUIState({
      mode: mode,
    });
  };

  onTogglePanelOptions = () => {
    const { uiState, updatePanelEditorUIState } = this.props;
    updatePanelEditorUIState({ isPanelOptionsVisible: !uiState.isPanelOptionsVisible });
  };

  renderPanel = (styles: EditorStyles) => {
    const { dashboard, panel, tabs, uiState } = this.props;
    return (
      <div className={cx(styles.mainPaneWrapper, tabs.length === 0 && styles.mainPaneWrapperNoTabs)} key="panel">
        {this.renderPanelToolbar(styles)}
        <div className={styles.panelWrapper}>
          <AutoSizer>
            {({ width, height }) => {
              if (width < 3 || height < 3) {
                return null;
              }
              return (
                <div className={styles.centeringContainer} style={{ width, height }}>
                  <div style={calculatePanelSize(uiState.mode, width, height, panel)}>
                    <DashboardPanel
                      dashboard={dashboard}
                      panel={panel}
                      isEditing={true}
                      isViewing={false}
                      isInView={true}
                    />
                  </div>
                </div>
              );
            }}
          </AutoSizer>
        </div>
      </div>
    );
  };

  renderPanelAndEditor(styles: EditorStyles) {
    const { panel, dashboard, tabs } = this.props;

    if (tabs.length > 0) {
      return [
        this.renderPanel(styles),
        <div
          className={styles.tabsWrapper}
          aria-label={selectors.components.PanelEditor.DataPane.content}
          key="panel-editor-tabs"
        >
          <PanelEditorTabs panel={panel} dashboard={dashboard} tabs={tabs} onChangeTab={this.onChangeTab} />
        </div>,
      ];
    }
    return this.renderPanel(styles);
  }

  renderTemplateVariables(styles: EditorStyles) {
    const { variables } = this.props;

    if (!variables.length) {
      return null;
    }

    return (
      <div className={styles.variablesWrapper}>
        <SubMenuItems variables={variables} />
      </div>
    );
  }

  renderPanelToolbar(styles: EditorStyles) {
    const { dashboard, location, uiState, variables, updateTimeZoneForSession } = this.props;
    return (
      <div className={styles.panelToolbar}>
        <HorizontalGroup justify={variables.length > 0 ? 'space-between' : 'flex-end'} align="flex-start">
          {this.renderTemplateVariables(styles)}

          <HorizontalGroup>
            <RadioButtonGroup value={uiState.mode} options={displayModes} onChange={this.onDisplayModeChange} />
            <DashNavTimeControls
              dashboard={dashboard}
              location={location}
              onChangeTimeZone={updateTimeZoneForSession}
            />
            {!uiState.isPanelOptionsVisible && (
              <DashNavButton
                onClick={this.onTogglePanelOptions}
                tooltip="Open options pane"
                classSuffix="close-options"
              >
                <Icon name="angle-left" /> <span style={{ paddingLeft: '6px' }}>Show options</span>
              </DashNavButton>
            )}
          </HorizontalGroup>
        </HorizontalGroup>
      </div>
    );
  }

  editorToolbar(styles: EditorStyles) {
    const { dashboard } = this.props;

    return (
      <div className={styles.editorToolbar}>
        <HorizontalGroup justify="space-between" align="center">
          <div className={styles.toolbarLeft}>
            <HorizontalGroup spacing="none">
              <BackButton onClick={this.onPanelExit} surface="panel" />
              <span className={styles.editorTitle}>{dashboard.title} / Edit Panel</span>
            </HorizontalGroup>
          </div>

          <HorizontalGroup>
            <HorizontalGroup spacing="sm" align="center">
              <Button
                icon="cog"
                onClick={this.onOpenDashboardSettings}
                variant="secondary"
                title="Open dashboard settings"
              />
              <Button onClick={this.onDiscard} variant="secondary" title="Undo all changes">
                Discard
              </Button>
              <Button onClick={this.onSaveDashboard} variant="secondary" title="Apply changes and save dashboard">
                Save
              </Button>
              <Button onClick={this.onPanelExit} title="Apply changes and go back to dashboard">
                Apply
              </Button>
            </HorizontalGroup>
          </HorizontalGroup>
        </HorizontalGroup>
      </div>
    );
  }

  renderOptionsPane() {
    const { plugin, dashboard, panel, uiState } = this.props;

    const rightPaneSize =
      uiState.rightPaneSize <= 1
        ? (uiState.rightPaneSize as number) * window.innerWidth
        : (uiState.rightPaneSize as number);

    if (!plugin) {
      return <div />;
    }

    return (
      <OptionsPaneContent
        plugin={plugin}
        dashboard={dashboard}
        panel={panel}
        width={rightPaneSize}
        onClose={this.onTogglePanelOptions}
        onFieldConfigsChange={this.onFieldConfigChange}
        onPanelOptionsChanged={this.onPanelOptionsChanged}
        onPanelConfigChange={this.onPanelConfigChanged}
      />
    );
  }

  render() {
    const { initDone, updatePanelEditorUIState, uiState } = this.props;
    const styles = getStyles(config.theme, this.props);

    if (!initDone) {
      return null;
    }

    return (
      <div className={styles.wrapper} aria-label={selectors.components.PanelEditor.General.content}>
        {this.editorToolbar(styles)}
        <div className={styles.verticalSplitPanesWrapper}>
          <SplitPaneWrapper
            leftPaneComponents={this.renderPanelAndEditor(styles)}
            rightPaneComponents={this.renderOptionsPane()}
            uiState={uiState}
            updateUiState={updatePanelEditorUIState}
            rightPaneVisible={uiState.isPanelOptionsVisible}
          />
        </div>
      </div>
    );
  }
}

const mapStateToProps: MapStateToProps<ConnectedProps, OwnProps, StoreState> = state => {
  const panel = state.panelEditor.getPanel();
  const { plugin } = getPanelStateById(state.dashboard, panel.id);

  return {
    location: state.location,
    plugin: plugin,
    panel,
    initDone: state.panelEditor.initDone,
    tabs: getPanelEditorTabs(state.location, plugin),
    uiState: state.panelEditor.ui,
    variables: getVariables(state),
  };
};

const mapDispatchToProps: MapDispatchToProps<DispatchProps, OwnProps> = {
  updateLocation,
  initPanelEditor,
  panelEditorCleanUp,
  setDiscardChanges,
  updatePanelEditorUIState,
  updateTimeZoneForSession,
};

export const PanelEditor = connect(mapStateToProps, mapDispatchToProps)(PanelEditorUnconnected);

/*
 * Styles
 */
export const getStyles = stylesFactory((theme: GrafanaTheme, props: Props) => {
  const { uiState } = props;
  const paneSpacing = theme.spacing.md;

  return {
    wrapper: css`
      width: 100%;
      height: 100%;
      position: fixed;
      z-index: ${theme.zIndex.sidemenu};
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: ${theme.colors.dashboardBg};
      display: flex;
      flex-direction: column;
    `,
    verticalSplitPanesWrapper: css`
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      position: relative;
    `,
    mainPaneWrapper: css`
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      padding-right: ${uiState.isPanelOptionsVisible ? 0 : paneSpacing};
    `,
    mainPaneWrapperNoTabs: css`
      padding-bottom: ${paneSpacing};
    `,
    variablesWrapper: css`
      label: variablesWrapper;
      display: flex;
      flex-grow: 1;
      flex-wrap: wrap;
    `,
    panelWrapper: css`
      flex: 1 1 0;
      min-height: 0;
      width: 100%;
      padding-left: ${paneSpacing};
    `,
    tabsWrapper: css`
      height: 100%;
      width: 100%;
    `,
    editorToolbar: css`
      display: flex;
      padding: ${theme.spacing.sm};
      background: ${theme.colors.panelBg};
      justify-content: space-between;
      border-bottom: 1px solid ${theme.colors.panelBorder};
    `,
    panelToolbar: css`
      display: flex;
      padding: ${paneSpacing} 0 ${paneSpacing} ${paneSpacing};
      justify-content: space-between;
      flex-wrap: wrap;
    `,
    toolbarLeft: css`
      padding-left: ${theme.spacing.sm};
    `,
    centeringContainer: css`
      display: flex;
      justify-content: center;
      align-items: center;
    `,
    editorTitle: css`
      font-size: ${theme.typography.size.lg};
      padding-left: ${theme.spacing.md};
    `,
  };
});

type EditorStyles = ReturnType<typeof getStyles>;
