import { useState, useContext, useRef, ReactNode, useEffect } from "react";
import * as React from "react";
import styled from "styled-components";
import TextField, { FilledTextFieldProps, OutlinedTextFieldProps, StandardTextFieldProps } from "@material-ui/core/TextField";
import Button from "@material-ui/core/Button";
import InputLabel from "@material-ui/core/InputLabel";
import { useSnackbar, withSnackbar } from 'notistack';
import firebase from "firebase/app";
import "firebase/storage";
import {
  textColor,
  lighterBackground,
  accentColor,
  PageContainer,
  secondAccent,
  CeremonyTitle,
  Center
} from "../styles";
import { Ceremony, CeremonyEvent } from "../types/ceremony";
import { addCeremony, jsonToCeremony } from "../api/ZKPartyApi";
import { addCeremonyEvent, ceremonyEventListener, getCeremony, updateCeremony } from "../api/FirestoreApi";
import FileUploader from "../components/FileUploader";
import { createStyles, makeStyles, Theme, withStyles } from "@material-ui/core/styles";
import { useSelectionContext } from "./SelectionContext";
import { UploadCircuitFile } from "../api/FileApi";

const HomeLinkContainer = styled.div`
  position: absolute;
  top: 16px;
  left: 16px;

  a {
    color: ${accentColor};

    &:hover {
      color: ${textColor};
      background-color: ${secondAccent};
    }
  }
`;

const NotFoundContainer = styled.div`
  width: 512px;
  background-color: ${lighterBackground};
  padding: 16px;
  border-radius: 4px;
  text-align: center;
`;

const CeremonyDetailsContainer = styled.div`
  width: 512px;
  background-color: ${lighterBackground};
  padding: 16px;
  border-radius: 4px;
`;

const AddCeremonyPage = () => {
  const [ceremony, setCeremony] = useState<null | Ceremony>(null);
  const [selection, dispatch] = useSelectionContext();

  console.debug(`AddCeremony ${selection.ceremonyId} ${JSON.stringify(ceremony)}`);

  // Edit an existing ceremony
  useEffect(() => {
    if (selection.ceremonyId && !ceremony) {
      console.debug(`getting ceremony`);
      getCeremony(selection.ceremonyId).then(
        c => {
          console.debug(`have ceremony`);
          if (c) setCeremony(c);
      });
    }},
    [selection.ceremonyId]
  );

  const onSubmit = () => {
    dispatch({
      type: 'CLOSE_CEREMONY',      
    });
  }

  return (
      <CeremonyDetails ceremony={ceremony} onSubmit={onSubmit}></CeremonyDetails> 
  );
};

const CssTextField = withStyles({
    root: {
      "& .MuiInput-root": {
        color: textColor,
      },
      "& label": {
        color: accentColor
      },
      "& label.Mui-focused": {
        color: accentColor,
      },
      "& .MuiInput-underline:after": {
        borderBottomColor: accentColor,
      },
      "& .MuiOutlinedInput-root": {
        "&.Mui-focused fieldset": {
          borderColor: secondAccent,
        }
      },
      "& .MuiFormControl-root": {
        width: '80%',
      },
      "& .MuiInputBase-input": {
        color: textColor,
      }
    }
  })(TextField);

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      display: 'block',
      flexWrap: 'wrap', 
    },
    margin: {
      margin: theme.spacing(1),
    },
  }),
);

const inputField = (props: StandardTextFieldProps & {oldValue: string}) => {
  //const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState<any | null>(props.oldValue);
  
  console.debug(`old value ${props.oldValue} ${value}`);

  useEffect(() => {
    if (!value)
      console.debug(`in effect: old value ${props.oldValue} ${value}`);
      setValue(props.oldValue);
    }, [props.oldValue]
  );
  const getValue = (): string | undefined => {
    return value || '';
  }

  const handleChange = (event: any) => {
    event.preventDefault();
    setValue(event.target.value);
  }

  return ({
    element: 
      (<CssTextField 
        {...props}
        value={value}
        variant='outlined'
       /* inputRef={inputRef} */
        onChange={handleChange}
        style={{ width: '80%' }}
      />),
    value: () => getValue(),
  });
}

const writeToDb = async (ceremony: Ceremony):Promise<string> => {
  if (ceremony.id) {
    await updateCeremony(ceremony);
    return ceremony.id;
  } else {
    return await addCeremony(ceremony);
  }
}

const uploadFile = async (id: string, circuitFile: File, onSubmit: () => void) => {
  UploadCircuitFile(id, circuitFile).then((snapshot) => {
    console.log('Uploaded file!');
    const event: CeremonyEvent = {
      sender: "COORDINATOR",
      eventType: "CIRCUIT_FILE_UPLOAD",
      timestamp: new Date(),
      message: "",
      acknowledged: false,
    }
    addCeremonyEvent(id, event);
    onSubmit();
  });
}

const CeremonyDetails = (props: { ceremony: Ceremony | null, onSubmit: () => void}) => {
  const classes = useStyles();
  const ceremony = useRef<Ceremony | any>({});
  const unsubscribe = useRef<(()=>void) | null>(null);
  const { enqueueSnackbar } = useSnackbar();

  const statusUpdate = (event: CeremonyEvent) => {
    enqueueSnackbar(event.message);
  };

  var circuitFile: File | null = null;
  if (!ceremony.current.id) {
    if (props.ceremony) {
      try {
        ceremony.current = props.ceremony;
        console.debug(`ceremony id ${ceremony.current.id}`);
      } catch (err) {
        console.log(`Cannot parse provided ceremony ${err.message}`);
      }
    } else {
      console.debug(`adding ceremony`);
    }
  }

  if (ceremony.current && !unsubscribe.current) {
    unsubscribe.current = ()=> {}; // placeholder
    ceremonyEventListener(ceremony.current.id, statusUpdate).then(unsub =>
      { unsubscribe.current = unsub }
    )
  }

  // const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  //     console.log(`handleChange ${e.target.id}`);
  //     e.preventDefault();

  //     switch (e.target.id) {
  //       //case 'title': ceremony.current.title = e.target.value; break;
  //       //case 'description': ceremony.current.description = e.target.value; break;
  //       case 'start-time': ceremony.current.startTime = Date.parse(e.target.value); break;
  //       case 'end-time': ceremony.current.endTime = Date.parse(e.target.value); break;
  //       //case 'min-participants': ceremony.current.minParticipants = parseInt(e.target.value); break;
  //     }
  // };

  const handleFileUpload = (f: File) => {
      console.log(`handleFileUpload`);
      circuitFile = f;
  }

  const title = inputField({
      id:"title", 
      label:"Title", 
      type:'text',
      multiline: true,
      InputLabelProps: { shrink: true },
      oldValue: ceremony.current?.title,
  });
  //console.debug(`title value: ${title.value()}`);

  const description = inputField({
    id:"desc", 
    label:"Description", 
    type:'text',
    multiline: true,
    InputLabelProps: { shrink: true },
    oldValue: ceremony.current?.description,
  });

  const startTime = inputField({
    id: 'start-time',
    label: 'Start Time',
    type: 'datetime-local',
    InputLabelProps: { shrink: true },
    oldValue: ceremony.current?.startTime,
  });

  const endTime = inputField({
    id: 'end-time',
    label: 'End Time',
    type: 'datetime-local',
    InputLabelProps: { shrink: true },
    oldValue: ceremony.current?.endTime,
  });

  const minParticipants = inputField({
    id:"min-participants", 
    label:"Minimum Participants", 
    type:'number',
    oldValue: ceremony.current?.minParticipants?.toString() || '0',
  });

  const validateInput = () => {
    var isValid = true;
    ceremony.current.title = title.value();
    ceremony.current.description = description.value();
    ceremony.current.startTime = startTime.value();
    ceremony.current.endTime = endTime.value();
    ceremony.current.minParticipants = minParticipants.value();
    if (!ceremony.current.title || ceremony.current.title.length == 0) {enqueueSnackbar("Must have a title"); isValid = false;}
    if (!ceremony.current.description || ceremony.current.description.length == 0) {enqueueSnackbar("Must have a description"); isValid = false;};
    return isValid;
  };

  const handleSubmit = (event: { preventDefault: () => void; }) => {
    console.log(`submit ....`);
    event.preventDefault();
    // validate
    if (!validateInput()) return;

    if (circuitFile) {
        // Firebase storage ref for the new file
        ceremony.current.circuitFileName = circuitFile.name;
    };
    // insert/update new DB record. Get id
    writeToDb(ceremony.current).then((id: string) => {
        console.log(`ceremony added/updated: ${id}`);
        if (!unsubscribe.current) {
          ceremonyEventListener(id, statusUpdate).then(unsub =>
            { unsubscribe.current = unsub; }
          );
        }

        if (circuitFile) {          
          uploadFile(id, circuitFile, props.onSubmit);
        }
    });
  }


  return (
    <CeremonyDetailsContainer>
        <form className={classes.root} noValidate autoComplete="off" >
            {title.element}
            <br />
            {description.element}
            <br />
            <span style={{ display: "flow"}}>
                <InputLabel variant="standard" style={{ color: accentColor }}>Circuit File:</InputLabel>
                <FileUploader id="circuitFileName" onChange={handleFileUpload} />
                <label>{ceremony.current?.circuitFileName}</label>
            </span>
            <br />
            {startTime.element}
            <br />
            {endTime.element}
            <br />
            {minParticipants.element}
            <br />
            <Button variant="contained" color="primary" onClick={handleSubmit}>Submit</Button>
      </form>
    </CeremonyDetailsContainer>
  );
};

export default withSnackbar(AddCeremonyPage);