// Runs before showing the Preferences Window
function onLoad(prefwindow)
{
	var synonext = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                  .getService(Components.interfaces.nsIWindowMediator)
                  .getMostRecentWindow("navigator:browser").synonext;
                 
	var textbox_password = prefwindow.getElementById('password');
	textbox_password.value = synonext.vars.password;
}

// Runs after the Preferences Windows was closed
function onUnload(prefwindow)
{
	var synonext = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                  .getService(Components.interfaces.nsIWindowMediator)
                  .getMostRecentWindow("navigator:browser").synonext;
	var prefs = synonext.srv.prefs;
	var server = prefs.getCharPref(synonext.consts.PREF_SERVER);
	var username = prefs.getCharPref(synonext.consts.PREF_USERNAME);	
	var autologin = prefs.getBoolPref(synonext.consts.PREF_AUTOLOGIN);
	var password = prefwindow.getElementById('password').value;
	synonext.vars.server = server;
	synonext.vars.username = username;
	synonext.vars.autologin = autologin;
	synonext.savePassword(server, username, password);
	synonext.vars.password = password;
	if (synonext.hasPreferences()) {
		synonext.login();
	}
}


