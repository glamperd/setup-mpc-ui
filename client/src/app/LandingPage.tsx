import { Link, RouteProps, useHistory } from "react-router-dom";
import { useState, useEffect, useReducer, Fragment } from "react";
import * as React from "react";
import styled, { css } from "styled-components";
import Typography from "@material-ui/core/Typography";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import Box from "@material-ui/core/Box";
import { ReactNode } from "react";
import ButtonAppBar from "../components/ButtonAppBar";
import CeremonySummary from "../components/CeremonySummary";
import { ParticipantSection } from "./ParticipantPage";

import {
  accentColor,
  secondAccent,
  textColor,
  PageContainer,
  lighterBackground,
  SectionContainer,
  CeremonyTitle
} from "../styles";
import {
  getCeremonySummaries,
  getCeremonySummariesCached
} from "../api/ZKPartyApi";
import { Ceremony } from "../types/ceremony";
import { ceremonyListener, getCeremonies, getCeremony } from "../api/FirestoreApi";
import { AuthContext } from "./AuthContext";
import AddCeremonyPage from "./AddCeremony";
import Modal from "@material-ui/core/Modal";
import { CeremonyPage } from "./CeremonyPage";
import { useSelectionContext } from './SelectionContext';
import './styles.css';
import { withStyles } from "@material-ui/core/styles";

const StyledTabs = withStyles(theme => ({
  indicator: {
    backgroundColor: secondAccent
  },

}))(Tabs);

export const LandingPage = () => {
    const [activeTab, setActiveTab] = useState("1");
    const [selection, dispatch] = useSelectionContext();

    const changeTab = (event: React.ChangeEvent<{}> | null, newValue: string) => {
      setActiveTab(newValue);
    };

    //const openCeremonyModal = () => {setOpenModal(true)};

    const closeCeremonyModal = () => {dispatch({type: 'CLOSE_CEREMONY'});}

    if (selection.edit) {
      // Open tab 3 for edit or add
      setActiveTab('3');
    }

    return (
        <AuthContext.Consumer>
          {(Auth) => {console.debug(`landing page: ${Auth.isCoordinator}`); return (
            <Fragment>
              <ButtonAppBar />
              <PageContainer>
                <StyledTabs 
                  value={activeTab} 
                  onChange={changeTab}
                  centered
                  style = {{ color: accentColor }}
                >
                  <Tab label="Ceremonies" value="1" />
                  <Tab label="Participate" value="2" />
                  {Auth.isCoordinator ? (<Tab label="New Ceremony" value="3" />) : (<></>) }
                </StyledTabs>
                <TabPanel value={activeTab} index="1">
                  <SummarySection key="summary" />
                </TabPanel>
                <TabPanel value={activeTab} index="2">
                  <ParticipantSection key="participants" />
                </TabPanel>
                <TabPanel value={activeTab} index="3">
                  <AddCeremonyPage />
                </TabPanel>
                <Modal
                  open={selection.openModal}
                  onClose={closeCeremonyModal}
                  aria-labelledby="simple-modal-title"
                  aria-describedby="simple-modal-description"
                >
                  <CeremonyPage onClose={closeCeremonyModal} />
                </Modal>
              </PageContainer>
            </Fragment>
          )}}
        </AuthContext.Consumer>
  );
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: any;
  value: any;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`wrapped-tabpanel-${index}`}
      aria-labelledby={`wrapped-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box p={3}>
          <Typography>{children}</Typography>
        </Box>
      )}
    </div>
  );
}

const SummarySection = (props: any) => {
  const [ceremonies, setCeremonies] = useState<Ceremony[]>([]);
  const [loaded, setLoaded] = useState(false);
  console.debug(`render summary section ${ceremonies.length > 2 ? ceremonies[2].complete : '-'}`);

  const findCeremonyIndex = (id: string): number => {
    return ceremonies.findIndex(val => val.id === id);
  }

  const updateCeremony = (ceremony: Ceremony) => {
    //console.log(`${ceremony}`);
    const idx = findCeremonyIndex(ceremony.id);
    const update = (c: Ceremony, i: number) => {
      if (i == idx) {
        console.debug(`updating ceremony ${ceremony.id} ${ceremony.complete}`);
        return ceremony;
      } else {
        return c;
      }
    }
    if (idx >= 0) {
      setCeremonies(prev => prev.map(update));
    } else {
      console.debug(`adding ceremony ${ceremony.id} ${ceremony.complete}`);
      setCeremonies(prev => [...prev, ceremony]);
    }
  };

  // const updateCeremonyCounts = (c: any) => {
  //   // callback for ceremony counts query
  //   // returns {ceremonyId, complete, waiting}
  //   console.log(`update count ${c.ceremonyId} ${c.complete}`);
  //   let newCeremonies = ceremonies;
  //   const i = findCeremonyIndex(c.ceremonyId);
  //   if (i>=0) {
  //     newCeremonies[i].waiting = c.waiting;
  //     newCeremonies[i].complete = c.complete;
  //   }
  //   setCeremonies(newCeremonies);
  // }

  useEffect(() => {
    getCeremonies()
      .then(ceremonies => {
        setCeremonies(ceremonies);
        // Subscribe to ceremony updates
        ceremonyListener(updateCeremony);
        console.debug('getCeremonies done');
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, [loaded]);

  return (
    <>
      {ceremonies.map((c, i) => (
        <CeremonySummary key={i} ceremony={c} />
      ))}
    </>
  );
};