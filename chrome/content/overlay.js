// The main synonext object
if (!synonext) var synonext = {};

// Variables
synonext.vars = {
	id: "",             // connection id
	server: "",         // server url
	username: "",       // login user name
	password: "",   	// login password
	timeout: 0,         // session timeout in minutes
	tttID: 0,           // tooltip timeoutID
	logging: true,     // Enable or disable logging
	autologin: true,	// Auto login at startup
	strings: null,		// String Bundle
	osType: ""			// Operating System Type
};

// Services
synonext.srv = {
    prefs: null,        // Preferences Service
	prompts: null,      // Prompts Service
	watcher: null,		// Window Watcher Service
	console: null,      // Console Service
	loginMgr: null		// Login Manager
}

// Constants
synonext.consts = {
    loginTimeout: 15,   // login timeout in seconds
    tooltipTimeout: 2,  // tooltip refresh time in seconds
    TOOLBARBUTTON_ID: "SynoToolbarButton",
	PREF_SERVER: "server",
	PREF_USERNAME: "username",
	PREF_TIMEOUT: "timeout",
	PREF_LOGGING: "logging",
	PREF_AUTOLOGIN: "autologin",
	PREF_FIRSTRUN: "firstrun"
}

// Initialization
synonext.init = function()
{
	// Get String Bundle
	synonext.vars.strings = document.getElementById('SynoStringBundle');
	
	// Get the OS type
	synonext.vars.osType = Components.classes["@mozilla.org/xre/app-info;1"]  
					      .getService(Components.interfaces.nsIXULRuntime).OS;
					      
	// Prompt service
	synonext.srv.prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                          .getService(Components.interfaces.nsIPromptService);

	// Window Watcher service
	synonext.srv.watcher = Components.classes['@mozilla.org/embedcomp/window-watcher;1']
		                  .getService(Components.interfaces.nsIWindowWatcher);

    // Console service
	synonext.srv.console = Components.classes["@mozilla.org/consoleservice;1"]
                          .getService(Components.interfaces.nsIConsoleService);
	
	// Login Manager
	synonext.srv.loginMgr = Components.classes["@mozilla.org/login-manager;1"]
                           .getService(Components.interfaces.nsILoginManager);

	// Preferences service	  
	synonext.srv.prefs = Components.classes["@mozilla.org/preferences-service;1"]
                        .getService(Components.interfaces.nsIPrefService)
						.getBranch("extensions.synonext.");
						
	// Get preferences
	synonext.vars.server = synonext.srv.prefs.getCharPref(synonext.consts.PREF_SERVER);
	synonext.vars.username = synonext.srv.prefs.getCharPref(synonext.consts.PREF_USERNAME);
	synonext.vars.timeout = synonext.srv.prefs.getIntPref(synonext.consts.PREF_TIMEOUT);
	synonext.vars.logging = synonext.srv.prefs.getBoolPref(synonext.consts.PREF_LOGGING);
	synonext.vars.autologin = synonext.srv.prefs.getBoolPref(synonext.consts.PREF_AUTOLOGIN);
	
	// Load the Password from Login Manager
	synonext.vars.password = synonext.loadPassword(synonext.vars.server,
												 synonext.vars.username);
	
	// Add event listener for context menu
	document.getElementById("contentAreaContextMenu")
			.addEventListener('popupshowing', synonext.updateConextMenu, false);		
	
	// Check Firstrun
	if (synonext.srv.prefs.getBoolPref(synonext.consts.PREF_FIRSTRUN)) {
		synonext.populateToolbar();
		synonext.srv.prefs.setBoolPref(synonext.consts.PREF_FIRSTRUN, false);
	}
}

// Entry point of the extension
synonext.load = function()
{
	synonext.init();
	
	if (document.getElementById(synonext.consts.TOOLBARBUTTON_ID)) {
		if (synonext.vars.autologin) {
			synonext.startLogin();
		}
	}
}

// Initiates login if preferences ok
synonext.startLogin = function()
{
	if (!synonext.hasPreferences()) {
		// Show preferences dialog
		synonext.preferencesDialog();
	} else {
		// Normal login
		synonext.login();
	}
}

// Populates the main toolbar with the SynoNext button
synonext.populateToolbar = function()
{
	var myId = synonext.consts.TOOLBARBUTTON_ID; // ID of button to add
	var afterId = "search-container"; // ID of element to insert after
	var navBar = document.getElementById("nav-bar");
	var curSet = navBar.currentSet.split(",");
	if (curSet.indexOf(myId) == -1) {
		var pos = curSet.indexOf(afterId) + 1 || curSet.length;
		var set = curSet.slice(0, pos).concat(myId).concat(curSet.slice(pos));
		navBar.setAttribute("currentset", set.join(","));
		navBar.currentSet = set.join(",");
		document.persist(navBar.id, "currentset");
		try {
			BrowserToolboxCustomizeDone(true);
		} catch (e) {}
	}
}

// Adds or removes the download menu item
synonext.updateConextMenu = function()
{
	var item1 = document.getElementById("SynoMenuItem1");
	item1.hidden = !(gContextMenu.onLink && !gContextMenu.onMailtoLink && synonext.isConnected());
	var item2 = document.getElementById("SynoMenuItem2");
	item2.hidden = !(content.getSelection() != "" && synonext.isConnected());
	if (!item2.hidden) {
		item1.hidden = true;
	}
};

// Return the full url to the Download cgi
synonext.cgiURL = function()
{
	if (synonext.vars.server != "") {
		return synonext.vars.server + "/webapi/";
	}
	return synonext.vars.server;
};

// Are we connected to the server?
synonext.isConnected = function()
{
	return (synonext.vars.id != "");
};

// Login (asynchronous) to the server and get a new id
synonext.login = function()
{
    synonext.log("try to login");
    
	var data = "api=SYNO.API.Auth&version=2&method=login&session=DownloadStation&format=sid";
	data += "&account=" + encodeURIComponent(synonext.vars.username);
	data += "&passwd=" + encodeURIComponent(synonext.vars.password);
	
	var button = document.getElementById(synonext.consts.TOOLBARBUTTON_ID);
	if (!document.getElementById(synonext.consts.TOOLBARBUTTON_ID)) {
		synonext.log("Konnte SynoNext Button nicht finden!");
		return;
	}
	
	var req = new XMLHttpRequest();
	req.onload = function() {
		synonext.vars.id = "";
	    clearTimeout(loginTimeoutID);
	    try {
            var obj = JSON.parse(req.responseText);
            if (obj.success && obj.data.sid) {
                synonext.vars.id = obj.data.sid;
                button.setAttribute("state", "online");
                window.setTimeout(function() {
						synonext.login();
					}, synonext.vars.timeout * 60000);
                synonext.log("login successful! (relog in "+synonext.vars.timeout+" minutes)");
            } else {
				button.setAttribute("state", "offline");
				synonext.info(synonext.tr('login_failed_text'),
							 synonext.tr('login_failed_title'));
            }
        } catch(e) {
			button.setAttribute("state", "offline");
            synonext.log("problem during login!");
        }
    };
    req.onerror = function() {
		button.setAttribute("state", "offline");
        synonext.info("Probably wrong server url!",
					 synonext.tr('login_failed_title'));
    };
    req.onabort = function() {
		button.setAttribute("state", "offline");
        synonext.log("login aborted! (probably wrong server url)");
    };
    var loginTimeoutID = setTimeout(function() {
			req.abort();
			synonext.log("login aborted! (probably wrong server url)");
		}, synonext.consts.loginTimeout * 1000);
    req.open("POST", synonext.cgiURL()+ "auth.cgi");
	req.setRequestHeader ("Accept-Encoding", "deflate"); 
	req.send(data);
};

// Adds multiple download tasks to the queue
synonext.addTaskURLs = function(urls)
{
	if (!synonext.isConnected()) {
		synonext.info(synonext.tr('could_not_connect'));
		return;
	}
	var base = "api=SYNO.DownloadStation.Task&version=1&method=create";
	base += "&sid=" + encodeURIComponent(synonext.vars.id);

	var tasks = urls.length;
	var count = 0;
	var success = 0;
	var failed = 0;

	if (tasks == 0) {
		synonext.info(synonext.tr('no_url_found'));
		return;
	}

	onLoad = function() {
		count += 1;
		if (JSON.parse(this.responseText).success) {
			success += 1;
		} else {
			failed += 1;
		}
		if (count == tasks) {
			if (success > 1) {
				msg = success + synonext.tr('multiple_tasks_accepted');
			} else {
				msg = synonext.tr('one_task_accepted');
			}
			if (failed > 0) {
				msg += "\n";
				if (failed > 1) {
					msg += failed + synonext.tr('multiple_tasks_not_accepted');
				} else {
					msg += synonext.tr('one_task_not_accepted');
				}
			}
			synonext.info(msg);
		}
		synonext.log("onLoad count: "+count+" (success: "+success+"/ failed: "+failed+")");
	};
	
	for (i = 0; i < tasks; i++) {
		var req = new XMLHttpRequest();
		req.onload = onLoad;
		req.open('POST', synonext.cgiURL() + "DownloadStation/task.cgi", true);
		req.setRequestHeader ("Accept-Encoding", "deflate"); 
		req.send(base + "&uri=" + encodeURIComponent(urls[i]));
	}
};

// Clears finished tasks in the queue
synonext.clearTasks = function()
{
	if (!synonext.isConnected()) {
		synonext.info(synonext.tr('could_not_connect'));
		return;
	}
	var ids = "";
	var get = new XMLHttpRequest();
	get.open('POST', synonext.cgiURL() + "DownloadStation/task.cgi", true);
	get.setRequestHeader ("Accept-Encoding", "deflate"); 
	get.onload = function () {
		var obj = JSON.parse(get.responseText);
		var data = obj.data.tasks;
		for (var i in data){
			if (data[i].status == "finished") {
				ids += data[i].id + ",";
			}
		}
		var req = new XMLHttpRequest();
		req.open('POST', synonext.cgiURL() + "DownloadStation/task.cgi", true);
		req.setRequestHeader ("Accept-Encoding", "deflate"); 
		req.send("api=SYNO.DownloadStation.Task&version=1&method=delete&id=" + encodeURIComponent(ids));
		req.onload = function () {
			synonext.info(synonext.tr('success_clearing_tasks')); // at least tried to...
		}
	}
	get.send("api=SYNO.DownloadStation.Task&version=1&method=list&sid=" + encodeURIComponent(synonext.vars.id));
};

// Send pasted URLs to the queue
synonext.pasteURL = function()
{
	var url_default = "http://";
	var url = {value: url_default};
	ok = synonext.srv.prompts.prompt(window, synonext.tr('paste_url'),
									synonext.tr('paste_urls_helptext'), url,
									null, {value: false});
	if (ok && url.value != url_default) {
		var urls = synonext.extractURLs(url.value);
		synonext.addTaskURLs(urls);
	}
};

// Check if preferences are all set
synonext.hasPreferences = function()
{
	return (synonext.vars.server != "" && synonext.vars.username != "");
};

// Shows the preferences dialog
synonext.preferencesDialog = function()
{
	window.open("chrome://synonext/content/options.xul",
				"SynoPreferences", "chrome");
};

// Extract URLs from plain text
synonext.extractURLs = function(text)
{
	var patt = new RegExp("(https?|ftp)://\\S+/\\S+", "g");
	//var patt = new RegExp("https?://rapidshare.com/files/\\d+/\\S+", "g");
	var urls = [];
	do {
		var result = patt.exec(text);
		if (result != null) {
			urls.push(result[0]);
		}
	} while (result != null)
	return urls;
};


// Callbacks

// Download menu item 1 callback
synonext.onMenuItem1 = function()
{
	var url = gContextMenu.linkURL;
	synonext.addTaskURLs([url]);
};

// Download menu item 2 callback
synonext.onMenuItem2 = function()
{
	// get user selection
	var sel = content.getSelection();

	// get next node in document fragment
	var getNextNode = function(node, skipChildren, endNode) {
		if (node.firstChild && !skipChildren) {
			return node.firstChild;
		}
		if (node == endNode) {
			return null;
		}
		if (!node.parentNode) {
			return null;
		}
		return node.nextSibling || getNextNode(node.parentNode, true, endNode); 
	};

	// loop over ranges from selection
	var urls = [];
	for(var i = 0; i < sel.rangeCount; i++) {
		var range = sel.getRangeAt(i)
		var frag = range.cloneContents();
		var node = frag.firstChild;
		do {
			if (node.nodeName == "A") {
				urls.push(node.href);
			}
			node = getNextNode(node, false, frag.lastChild);
		} while (node);	
	}
	if (urls.length == 0) {
		urls = synonext.extractURLs(sel.toString());
	}
	synonext.addTaskURLs(urls);
};

// compare function for task items
synonext.compareTaskItems = function(a, b)
{
	if (a.id > b.id) {
		return 1;
	}
	if (a.id < b.id) {
		return -1;
	}
	return 0;
}

// Populates the Tooltip
synonext.populateTooltip = function()
{
    synonext.log("populate tooltip");
    
    var connect = document.getElementById("SynoConnectStatus");
	var taskbox = document.getElementById("SynoTaskBox");
	var task_count = document.getElementById("SynoTaskCount");
	var tasklist = document.getElementById("SynoTaskList");
	
	if (!synonext.isConnected()) {
		connect.value = synonext.tr('not_connected');
		connect.setAttribute("state", "offline");
		taskbox.setAttribute("hidden", "true");
		tasklist.setAttribute("hidden", "true");
		return;
	}
	
	connect.value = synonext.tr('connected');
	connect.setAttribute("state", "online");
	
	var req = new XMLHttpRequest();
	req.onload = function() {
	    try {
            var obj = JSON.parse(req.responseText);
            if (obj.success) {
				// success
				
				// We got results
				taskbox.setAttribute("hidden", "false");
				task_count.value = obj.data.tasks.length;
				if (task_count.value > 0) {
					tasklist.setAttribute("hidden", "false");
				} else {
					tasklist.setAttribute("hidden", "true");
				}
				
				// Save selected index
				var selected_index = tasklist.selectedIndex;
				
				// remove all rows
				for (var i in tasklist) {
					tasklist.removeItemAt(i);
				}

				// sort items
				obj.data.tasks.sort(synonext.compareTaskItems);

				// add items
				for (var i in obj.data.tasks)
				{
					var task = obj.data.tasks[i];

					// create new cols
					var col_name = document.createElement('listcell');
					var col_progress = document.createElement('listcell');
					var col_speed = document.createElement('listcell');
					var col_status = document.createElement('listcell');

					// set values
					col_name.setAttribute('label', task.title);
					col_name.setAttribute('id', "filename");
					col_progress.setAttribute('label', (task.additional.transfer.size_downloaded*100/task.size).toFixed(2));
					col_speed.setAttribute('label', synonext.trSpeed(task.additional.transfer.speed_download));
					col_status.setAttribute('label', synonext.trStatus(task.status));

					// create new row
					var row = document.createElement('listitem');

					// add cols to row
					row.appendChild(col_name);
					row.appendChild(col_progress);
					row.appendChild(col_speed);
					row.appendChild(col_status);

					// add new row
					tasklist.appendChild(row);
				}
				
				// restore the old selection
				tasklist.selectedIndex = selected_index;
				
				// call me again
				synonext.vars.tttID = window.setTimeout(function() {
						synonext.populateTooltip();
					}, synonext.consts.tooltipTimeout * 5000);

            } else {
				// We got no results
				task_count.value = synonext.tr('got_no_tasks');
				taskbox.setAttribute("hidden", "false");
				tasklist.setAttribute("hidden", "true");				
            }
        } catch(e) { }
    };
	req.open("POST", synonext.cgiURL() + "DownloadStation/task.cgi", true);
	req.setRequestHeader ("Accept-Encoding", "deflate"); 
	req.send("api=SYNO.DownloadStation.Task&version=1&method=list&additional=transfer&sid=" + encodeURIComponent(synonext.vars.id));
}

// Tooltip popup hidden event 
synonext.onTooltipHidden = function()
{
    clearTimeout(synonext.vars.tttID);
    synonext.log("stopped refreshing tooltip");
}

// Status popup menu show event 
synonext.onStatusPopupShowing = function()
{
    var hidden = true;
	var state = document.getElementById(synonext.consts.TOOLBARBUTTON_ID)
						.getAttribute("state");
	if (state == "online") {
		hidden = false;
	}
	document.getElementById("SynoConnect").hidden = !hidden;
	document.getElementById("SynoPasteURL").hidden = hidden;
    document.getElementById("SynoClearItem").hidden = hidden;
}


// Utils

// Get translated String
synonext.tr = function(key)
{
	try {
		return synonext.vars.strings.getString(key);
	} catch (e) {
		synonext.log("String für key '"+key+"' nicht gefunden!");
		return key;
	}
}

// Translates Synology JSON status to human readable status
synonext.trStatus = function(synostatus)
{
	switch (synostatus) {
		case "waiting":
			return synonext.tr('status_waiting');
		case "downloading":
			return synonext.tr('status_downloading');
	        case "paused":
			return synonext.tr('status_paused');
		case "finished":
			return synonext.tr('status_completed');
		case "hash_checking":
			return synonext.tr('status_checking');
		case "seeding":
			return synonext.tr('status_seeding');
		case "error":
			return synonext.tr('status_error');
		default:
			return synonext.tr('status_unknown') + synostatus;
	}
};

// Converts bytes in human readable speeds
synonext.trSpeed = function(bytes)
{
    var KILOBYTE = 1024;
    var MEGABYTE = KILOBYTE * 1024;
    
    if (bytes == 0) {
        return "-";
    } else if (bytes <= KILOBYTE) {
        return Math.round(bytes) + ' B/s'
    } else if (bytes <= MEGABYTE) {
        return Math.round(bytes/KILOBYTE) + ' kB/s';
    } else {
        return Math.round((bytes/MEGABYTE)*100)/100 + ' MB/s';
    }
};

// Reformat the displayed text
synonext.trProgress = function(text)
{
    return text.replace("NA", "-");
};

// Show a notification message
synonext.info = function(text, title)
{
	img = 'chrome://synonext/skin/synonext.png';
	try {
		Components.classes['@mozilla.org/alerts-service;1']
			.getService(Components.interfaces.nsIAlertsService)
			.showAlertNotification(img, title || "SynoNext Info", text);
	} catch (e) {
		var buttons = null;
		if (synonext.vars.osType == 'Darwin') {
			buttons = [{  
				label: synonext.tr('nicer_notifications'),
				accessKey: 'w', 
				callback: function(){
					gBrowser.addTab("http://www.growl.info");
					gBrowser.selectTabAtIndex(gBrowser.tabs.length - 1);
				}
			}]; 
		}
		var nb = gBrowser.getNotificationBox();
		if (title) {
			text = title + ' ' + text;
		}
		nb.appendNotification(text, 'synonext-notification',
							  img, nb.PRIORITY_INFO_MEDIUM, buttons);
		synonext.log(synonext.tr('using_alternative_notifications'));
	}
};

// Log a message to Javascript Error Console if enabled
synonext.log = function(text)
{
    if (synonext.vars.logging) {
        var time = new Date().toLocaleTimeString();
        synonext.srv.console.logStringMessage("SynoNext ("+time+"): "+text);
    }
}

// Returns the password from the password manager
synonext.loadPassword = function(server, username)
{
	var realm = "SynoNext";
	var loginMgr = Components.classes["@mozilla.org/login-manager;1"]
                   .getService(Components.interfaces.nsILoginManager);
    var logins = loginMgr.findLogins({}, server, "", realm);
	for (var i = 0; i < logins.length; i++) {
		if (logins[i].username == username) {
			synonext.log(synonext.tr('success_loading_password'));
			return logins[i].password;
		}
	}
	synonext.log(synonext.tr('failure_loading_password'));
	return "";
};

// Saves the password to the password manager
synonext.savePassword = function(server, username, password)
{
	var realm = "SynoNext";
	var loginMgr = Components.classes["@mozilla.org/login-manager;1"]
                   .getService(Components.interfaces.nsILoginManager);
    var nsLoginInfo = new Components.Constructor("@mozilla.org/login-manager/loginInfo;1",  
												 Components.interfaces.nsILoginInfo, "init");
	var loginInfo = new nsLoginInfo(server, null, realm, username, password, "", "");
	var logins = loginMgr.findLogins({}, server, "", realm);
	for (var i = 0; i < logins.length; i++) {
		if (logins[i].username == username) {
			if (password == "") {
				loginMgr.removeLogin(logins[i]);
				synonext.log(synonext.tr('password_removed_because_empty'));
			} else {
				loginMgr.modifyLogin(logins[i], loginInfo);
				synonext.log(synonext.tr('password_updated'));
			}
			return;
		}
	}
	if (password == "") {
		synonext.log(synonext.tr('password_not_saved_because_empty'));
	} else {
		loginMgr.addLogin(loginInfo);
		synonext.log(synonext.tr('password_created'));
	}
};
