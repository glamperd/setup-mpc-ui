import { useEffect, Fragment } from "react";
import React, { useState, useReducer, useRef } from "react";
import styled, { css } from "styled-components";
import Typography from "@material-ui/core/Typography";
import { GetParamsFile, UploadParams } from "../api/FileApi";0
import { AuthContext } from "../app/AuthContext";

import {
  accentColor,
  secondAccent,
  textColor,
  PageContainer,
  lighterBackground,
  SectionContainer,
  CeremonyTitle
} from "../styles";
import { CeremonyEvent, ContributionState, ContributionSummary, Participant, ParticipantState } from "./../types/ceremony";
import Button from "@material-ui/core/Button";
import CircularProgress from "@material-ui/core/CircularProgress";
import { addCeremonyEvent, addOrUpdateContribution, addOrUpdateParticipant, ceremonyContributionListener, ceremonyQueueListener } from "../api/FirebaseApi";
import VirtualList from "./../components/MessageList";

const Acknowledge = ({ contribute }: { contribute: () => void}) => (<Button onClick={contribute} style={{color: 'white'}}>Contribute</Button>);

// const Unloaded = (props: { loading: boolean, loadWasm: any }) => {
//   return props.loading ? (
//     <div>Loading...</div>
//   ) : (
//     <Button onClick={props.loadWasm} style={{color: 'white'}}>Load library</Button>
//   );
// };

const createCeremonyEvent = (eventType: string, message: string): CeremonyEvent => {
  return {
    sender: "PARTICIPANT",
    eventType,
    timestamp: new Date(),
    message,
    acknowledged: false,  
  };
};

const createContributionSummary = (participantId: string, status: ParticipantState, paramsFile: string, index: number, hash: string): ContributionSummary => {
  return {
    lastSeen: new Date(),
    hash,
    paramsFile,
    index,
    participantId,
    status,
    timeCompleted: new Date(),
  }
};

interface ComputeStatus {
  running: boolean,
  downloaded: boolean,
  started: boolean,
  computed: boolean,
  newParams: Uint8Array,
  uploaded: boolean,
};

const initialComputeStatus: ComputeStatus = {
  running: false,
  downloaded: false,
  started: false,
  computed: false,
  newParams: new Uint8Array(),
  uploaded: false,
}

const newParticipant = (uid: string): Participant => {
  return {
    address: '',
    uid,
    tier: 1,
    online: true,
    addedAt: new Date(),
    state: "WAITING",
    computeProgress: 0,
  }
}

const doComputation = (wasm: any, params: Uint8Array, entropy: Buffer) => new Promise<Uint8Array>((resolve, reject) => {
  try {
    const newParams = wasm.contribute(params, entropy);
    console.log('Updated params', newParams);
    resolve(newParams);
  } catch (err) {
    reject(err);
  }
});

const welcomeText = (
  <Typography variant="body1">
  Welcome to zkparty. This page will allow you to participate in the ceremony. Click to your commence your contribution. 
  </Typography>);

enum Step {
  NOT_ACKNOWLEDGED,
  ACKNOWLEDGED,
  INITIALISED,
  ENTROPY_COLLECTED,
  WAITING,
  QUEUED,
  RUNNING,
}

const stepText = (step: string) => (<Typography>{step}</Typography>);


export const ParticipantSection = () => {
  const [step, setStep] = React.useState(Step.NOT_ACKNOWLEDGED);
  const [computeStatus, setComputeStatus] = React.useState<ComputeStatus>(initialComputeStatus);
  const [messages, setMessages] = useState<string[]>([]);
  const wasm = useRef<any | null>(null);
  const data = useRef<Uint8Array | null>(null);
  const entropy = useRef(new Uint8Array());
  const participant = useRef<Participant | null>(null);
  const contributionState = useRef<ContributionState | null>(null);
  const Auth = React.useContext(AuthContext);
  const index = 1;

  const addMessage = (msg: string) => {
    const newMessages = messages;
    newMessages.push(msg);
    setMessages(newMessages);
  }

  const clearMessages = () => {
      setMessages([]);
  }

  const getParticipant = async () => {
    console.log(`uid: ${Auth.authUser.uid}`);
    participant.current = newParticipant(Auth.authUser.uid);
    await addOrUpdateParticipant(participant.current);
  };

  const loadWasm = async () => {
    //try {
      //if (!loading) {
      //  setLoading(true);
        // ignore syntax check error. Make sure to *npm link* phase2 in ../lib/pkg
        wasm.current = await import('phase2');
        console.log('wasm set');
      //}
    //} finally {
      //setLoading(false);
    //}
  };

  const getEntropy = () => {
    entropy.current = new Uint8Array(64).map((v, i) => Math.random() * 256);
    console.log(`entropy set`);
  };

  const setContribution = (cs: ContributionState) => {
    // Only accept new tasks if we're waiting
    if (step !== Step.RUNNING && step !== Step.QUEUED) {
      contributionState.current = cs;
      addMessage(`You are in the queue for ceremony ${cs.ceremony.title}`);
      ceremonyQueueListener(cs.ceremony.id, updateQueue);
      setStep(Step.QUEUED);
    } else {
      console.log(`Contribution candidate received while running another. ${step}`);
    }
  }

  const updateQueue = (update: any) => {
    contributionState.current = {...contributionState.current, ...update};
    if (contributionState.current?.queueIndex === contributionState.current?.currentIndex) {
      addMessage(`The time for your contribution has arrived.`);
      setComputeStatus({...computeStatus, running: true});
      setStep(Step.RUNNING);
    }
  }

  const compute = async () => {
    const { running, downloaded, started, computed, uploaded, newParams } = computeStatus;
    console.log(`compute step: ${running? 'running' : '-'} ${running && downloaded && !computed ? 'computing': running && computed && !uploaded ? 'uploaded' : 'inactive'}`);
    const ceremonyId = contributionState.current?.ceremony.id;
    if (running && contributionState.current && ceremonyId) {
      if (!downloaded) {
        GetParamsFile(ceremonyId, index).then( (paramData) => {
          addCeremonyEvent(ceremonyId, createCeremonyEvent( "PARAMS_DOWNLOADED", `Parameters from participant ${index} downloaded OK`));
          console.log('Source params', paramData);
          data.current = paramData;
          addMessage(`Parameters downloaded.`);
          setComputeStatus({...computeStatus, downloaded: true});
        })
      }
      if (downloaded && !computed) {
        if (!started) {
          console.log('running computation......');
          if (data.current) {
            doComputation(wasm.current, data.current, Buffer.from(entropy.current)).then(async (newParams) => {
              console.log('DoComputation finished');
              await addCeremonyEvent(ceremonyId, createCeremonyEvent(
                "COMPUTE_CONTRIBUTION", 
                `Contribution for participant ${index + 1} completed OK`
              ));
              addMessage(`Computation completed.`);
              entropy.current = new Uint8Array(); // Reset now that it has been used
              setComputeStatus({...computeStatus, computed: true, newParams});
          })};
          setComputeStatus({...computeStatus, started: true});
        }
      }
      if (computed && !uploaded) {
        try {
          const newIndex = index+1;
          const paramsFile = await UploadParams(ceremonyId, newIndex, newParams);
          // Add event to notify status and params file name
          await addCeremonyEvent(ceremonyId, createCeremonyEvent(
            "PARAMS_UPLOADED", 
            `Parameters for participant ${newIndex} uploaded to ${paramsFile}`
          ));
          addMessage(`Parameters uploaded.`);
          const contribution = createContributionSummary( participant.current ? participant.current.uid : '??', "COMPLETE", paramsFile, newIndex, '???hash');
          await addOrUpdateContribution(ceremonyId, contribution);
        } finally {
          setComputeStatus({...computeStatus, running: false, uploaded: true, newParams: new Uint8Array()});
          //setCeremonyId(null);
          contributionState.current = null;
          setStep(Step.WAITING);
        }
      }
    }
  }; 

  let content = (<></>);
  if (!Auth.isLoggedIn) {
    content = (<Typography>Sorry, please login to access this page</Typography>);
  } else {
    console.log(`step ${step.toString()}`);
  switch (step) {
    case (Step.NOT_ACKNOWLEDGED): {
      // Display welcome text until the 'go ahead' button is clicked.
      content = (<div>{welcomeText}<Acknowledge contribute={() => setStep(Step.ACKNOWLEDGED)} /></div>);
      break;
    }
    case (Step.ACKNOWLEDGED): {
      // After 'go ahead' clicked
      // Display status messages for all remaining conditions
      // Initialise - get participant ID, load wasm module
      const p1 = participant.current ? undefined : getParticipant();
      const p2 = wasm.current ? undefined : loadWasm();
      Promise.all([p1, p2]).then(() => {
        console.log('INITIALISED');
        setStep(Step.INITIALISED)
      });
      content = stepText('Loading compute module...');
      break;
    }
    case (Step.INITIALISED): {
      // Collect entropy
      if (entropy.current.length == 0) getEntropy();
      content = stepText('Collecting entropy...');
      setStep(Step.ENTROPY_COLLECTED);
      break;
    }
    case (Step.ENTROPY_COLLECTED): {
      // start looking for a ceremony to contribute to
      if (participant.current) ceremonyContributionListener(participant.current.uid, setContribution);
      content = stepText('Starting listener...');
      addMessage('Initialised.');
      setStep(Step.WAITING);
      break;
    }
    case (Step.WAITING): {
      // Waiting for a ceremony
      if (!computeStatus.running && contributionState.current) {
        console.log(`contribution state: ${JSON.stringify(contributionState.current)}`);
        if (contributionState.current.queueIndex === contributionState.current.currentIndex) {
          console.log('ready to go');
          setComputeStatus({...initialComputeStatus, running: true });
        }
      }
    
      content = stepText('Waiting...');
      break;
    }
    case (Step.QUEUED): {
      // Waiting for a ceremony
      if (!computeStatus.running && contributionState.current) {
        console.log(`contribution state: ${JSON.stringify(contributionState.current)}`);
        if (contributionState.current.queueIndex === contributionState.current.currentIndex) {
          console.log('ready to go');
          setComputeStatus({...initialComputeStatus, running: true });
        }
      }
    
      content = stepText('Queue position allocated ...');
      break;
    }
    case (Step.RUNNING): {
      // We have a ceremony to contribute to. Download parameters

      // Compute

      // Upload
      compute();

      content = (<><CircularProgress />{
           !computeStatus.downloaded ? stepText('Downloading ...') 
         : !computeStatus.computed ? stepText('Calculating ...')
         : stepText('Uploading ...') 
      }</>);
      break;
    }
  }};

  //const run = () => {
  //  setComputeStatus({...initialComputeStatus, running: true });
  //};

  // const serviceWorker = () => { 
  //   navigator.serviceWorker.ready.then(() => {
  //     console.log('service worker ready');
  //     navigator.serviceWorker.controller?.postMessage({type: 'LOAD_WASM'});
  //     navigator.serviceWorker.addEventListener('message', event => {
  //       console.log(`message from service worker ${event.data.type}`);
  //     });
  //   });
  // };

  //serviceWorker();

  return (
      <div style={{ width: "512px" }}>
        {content}
        <VirtualList messages={messages}/>
      </div>
  );
};
