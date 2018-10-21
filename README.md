# CasparCG State Scanner
App that handles OSC data from CasparCG Server, and deliver status as http request

First draft of CasparCG-State-Scanner is now working. For now the only query is "allChannels".

The number of channels and layers are specified in: 
```
var ccgNumberOfChannels = 4;
var ccgNumberOfLayers = 30;
``` 

## Queries:
### allChannels: 
Returns a complete Channel - Layer datalist with status of CCG server
```
{ allChannels }
```

### channel(ch: int):
Returns all layers of channel
```
{ channel(ch: 1) }
```

### layer(ch: int, l: int):
Returns selected layer of channel
```
{ layer(ch: 1, l: 10) }
```
### timeLeft(ch: int, l: int):
Returns countdown of channel, layer, file
```
{ timeLeft(ch: 1, l: 10) }
```


## Start:
```
yarn build
yarn start
```
After that open a browser:
```
http://localhost:5254/test
```
and try out queries

### For API calls from other programs use:
```
http://xxx.xxx.xxx.xxx:5254/api
```

##Build for Linux and Windows:
```
yarn build
yarn build-win
yarn build-linux
```

### ToDo:
Queries so you can ask for e.g. time left of a single Channel-Layer
