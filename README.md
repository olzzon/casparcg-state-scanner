# CasparCG State Scanner
App that handles OSC data from CasparCG Server, and deliver status as http request

First draft of CasparCG-State-Scanner is now working. For now the only query is "allChannels".

## allChannels query
Returns a complete Channel - Layer datalist with status of CCG server
The number of channels and layers are specified in: 
```
var ccgNumberOfChannels = 4;
var ccgNumberOfLayers = 30;
``` 

## Start:
```
yarn build
yarn start
```
After that open a browser:
```
http://localhost:5254/api
```
and try out queries

### ToDo:
Queries so you can ask for e.g. time left of a single Channel-Layer
