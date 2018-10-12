const OSC = require('osc-js');

export class CcgStateOSC extends OSC {
	connect() { 
		this.open();//this.ccgConnection.localport);
		this.getInitialState();
	}
	getInitialState() {
		//Using ACMP Info on sub 2.2 version
		//2.2 and up?
	}
}
