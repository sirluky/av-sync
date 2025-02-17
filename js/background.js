class Background {
    constructor() {
		var tabStorage = [];
        this.tabIds = new Map();
		this.currentVideoTimeAtExtensionToggle = new Map();
        this.removeURLParameters = (url, parameters) => {
            const urlParts = url.split('?');
            if (urlParts.length < 2)
                return;
            let currentParameters = urlParts[1].split(/[&;]/g);
            const encodedParameters = parameters.map((para) => `${encodeURIComponent(para)}=`);
            const filteredParameters = currentParameters.filter((p) => !encodedParameters.some((enc) => p.startsWith(enc)));
            return `${urlParts[0]}?${filteredParameters.join('&')}`;
        };

        this.processRequest = (details) => {
            const { url, tabId } = details;
            if (!url.includes('mime=audio'))
                return;
            if (url.includes('live=1')) {
                this.tabIds.set(tabId, '');
                this.sendMessage(tabId);
                return;
            }

            const parametersToBeRemoved = ['range', 'rn', 'rbuf'];
            const audioURL = this.removeURLParameters(url, parametersToBeRemoved);
            if (audioURL && this.tabIds.get(tabId) !== audioURL) {
                this.tabIds.set(tabId, audioURL);
                this.sendMessage(tabId);
            }
        };

        this.sendMessage = (tabId) => {
            if (this.tabIds.has(tabId)) {
                chrome.tabs.sendMessage(tabId, {
                    url: this.tabIds.get(tabId),
                });
            }
        };

        this.enableExtension = () => {
            chrome.browserAction.setIcon({
                path: {
                    19: 'img/icon19.png',
                    38: 'img/icon38.png',
                },
            });

			this.saveSettings(false);

			chrome.browserAction.setTitle({title: "YouTube Audio/Video Sync - Enabled"});

            chrome.tabs.onUpdated.addListener(this.sendMessage);
            chrome.webRequest.onBeforeRequest.addListener(this.processRequest, { urls: ['<all_urls>'] });
			background.refreshYoutubeTab.call();
        };

        this.disableExtension = () => {
            chrome.browserAction.setIcon({
                path: {
                    19: 'img/disabled_icon19.png',
                    38: 'img/disabled_icon38.png',
                },
            });

			this.saveSettings(true);
			chrome.browserAction.setTitle({title: "YouTube Audio/Video Sync - Disabled"});

            chrome.tabs.onUpdated.removeListener(this.sendMessage);
            chrome.webRequest.onBeforeRequest.removeListener(this.processRequest);
            this.tabIds.clear();
			background.refreshYoutubeTab.call();
		};

        this.saveSettings = (disabled) => {
            chrome.storage.local.set({ is_extension_disabled: disabled });
        };

		this.refreshYoutubeTab = () => {
			chrome.tabs.query({
                active: true,
                currentWindow: true,
                url: '*://*.youtube.com/*',
            }, (tabs) => {
                if (tabs.length > 0) {
						chrome.tabs.sendMessage(tabs[0].id, {"message": "getCurrentTime"}, function(response) {

						//calling chrome.runtime.lastError is needed in order to suppress this error (Chrome bug): "Unchecked runtime.lastError: Could not establish connection. Receiving end does not exist."
						if(chrome.runtime.lastError || response === undefined)
						{
							chrome.notifications.create('', {
							  title: 'YouTube Audio/Video Sync',
							  message: 'The extension has been recently installed or updated. To use it on an already opened youtube tab, you first need to refresh that tab!',
							  iconUrl: 'img/icon128.png',
							  type: 'basic',
							  requireInteraction: true
							});
						}
						else
						{
							tabStorage[tabs[0].id] = {time: response.currentTime, url: tabs[0].url};
							chrome.tabs.update(tabs[0].id, { url: tabs[0].url });
						}
					});
                }
            });
		}

		this.performInstallActions = (details) => {
			if(details.reason === "install")
			{
				const optionsUrl = chrome.runtime.getURL('html/options.html');
				chrome.tabs.create({url: optionsUrl});

				this.enableExtension();
				chrome.storage.local.set({ "syncValue": 0 });
			}
			else if(details.reason === "update")
			{								
				
				this.migrateToReversedSignSyncValue();
				this.toggleExtensionBasedOnStoredValue();
				
			}
		}
		
		this.migrateToReversedSignSyncValue = () => {
			chrome.storage.local.get(['syncValue', 'delayValue'], (values) => {
					let delayValue = values.delayValue;
					let syncValue = values.syncValue;
					if(syncValue === undefined)
					{
						if(delayValue !== undefined)
						{
							this.processSyncChange(delayValue * -1);
						}
					}
				});
		}
		
		this.toggleExtension = () => {
				chrome.storage.local.get('is_extension_disabled', (values) => {
					let disabled = values.is_extension_disabled;
					if (disabled) {
						this.enableExtension();
					}
					else {
						this.disableExtension();
					}
				});	
		}	
		
		this.toggleExtensionBasedOnStoredValue = () => {
				chrome.storage.local.get('is_extension_disabled', (values) => {
					let disabled = values.is_extension_disabled;
					if (disabled) {
						this.disableExtension();
					}
					else {
						this.enableExtension();
					}
				});	
		}
		
		this.performAudioDeviceConnectedActions = (audioDevice) => 
		{
			chrome.storage.local.set({autoToggleAudioDevice : true, audioDevice : audioDevice});											
								
			chrome.storage.local.get('is_extension_disabled', (values) => {
					let disabled = values.is_extension_disabled;
					if (disabled) {
						this.enableExtension();
					}					
				});				
		}

		this.processSyncChange = (syncValue) => {
			chrome.storage.local.set({ "syncValue": syncValue });
				chrome.tabs.query({}, function(tabs) {
					var message = {"message": "syncChanged", "syncValue": syncValue};
					for (var i=0; i<tabs.length; ++i) {
						chrome.tabs.sendMessage(tabs[i].id, message);
					}
				});
		}

        chrome.browserAction.onClicked.addListener(() => {
			chrome.browserAction.setBadgeText({text: ""});

            chrome.storage.local.get('is_extension_disabled', (values) => {
                let disabled = values.is_extension_disabled;
                if (disabled) {
                    this.enableExtension();
                }
                else {
                    this.disableExtension();
                }
            });
        });

		chrome.runtime.onStartup.addListener(() => {
			chrome.browserAction.setBadgeText({text: ""});

            chrome.storage.local.get('is_extension_disabled', (values) => {
                let disabled = values.is_extension_disabled;
                if (disabled) {
                    this.disableExtension();
                }
                else {
                    this.enableExtension();
                }
            });
		});

		//If for any reason "clearTabStorage" doesn't reach the background script, clear the storage when tab is closed.
		chrome.tabs.onRemoved.addListener(function(tabId, removed) {
			tabStorage.splice(tabId, 1);
		});

		this.processMessage = (request, sender, sendResponse) =>
		{
			if(request.message === "processSyncChange")
			{
				this.processSyncChange(request.syncValue);				
			}
			
			if(request.message === "maxSelectableDelayChange")
			{
				const maxSelectableDelayValue = request.maxSelectableDelayValue;
				chrome.storage.local.set({ "maxSelectableDelayValue": maxSelectableDelayValue });
				chrome.tabs.query({}, function(tabs) {
					var message = {"message": "maxSelectableDelayChanged", "maxSelectableDelayValue": maxSelectableDelayValue};
					for (var i=0; i<tabs.length; ++i) {
						chrome.tabs.sendMessage(tabs[i].id, message);
					}
				});
			}

			if(request.message === "maxAcceptableDelayChange")
			{
				const maxAcceptableDelayValue = request.maxAcceptableDelayValue;
				chrome.storage.local.set({ "maxAcceptableDelayValue": maxAcceptableDelayValue });
				chrome.tabs.query({}, function(tabs) {
					var message = {"message": "maxAcceptableDelayChanged", "maxAcceptableDelayValue": maxAcceptableDelayValue};
					for (var i=0; i<tabs.length; ++i) {
						chrome.tabs.sendMessage(tabs[i].id, message);
					}
				});
			}

			if(request.message === "getCurrentTimeBeforeToggle")
			{
				if(tabStorage[sender.tab.id] != undefined)
				{
					sendResponse(tabStorage[sender.tab.id]);
				}
				else
				{
					sendResponse("notFound");
				}
			}

			if(request.message === "clearTabStorage")
			{
				tabStorage.splice(sender.tab.id, 1);
			}

			if(request.message === "setWaitingBadge")
			{
				chrome.browserAction.setBadgeText({text: "⌛", tabId: sender.tab.id});
				chrome.browserAction.setBadgeBackgroundColor({color: "#FFFFFF", tabId: sender.tab.id});
			}

			if(request.message === "removeWaitingBadge")
			{
				chrome.browserAction.setBadgeText({text: "", tabId: sender.tab.id});
			}
			
			if(request.message === "toggleExtension")
			{
				this.toggleExtension();
			}
			
			if(request.message === "performAudioDeviceConnectedActions")
			{
				this.performAudioDeviceConnectedActions(request.audioDevice);
			}
			
			if(request.message === "performAudioDeviceDisconnectedActions")
			{
				chrome.storage.local.get('is_extension_disabled', (values) => {
					let disabled = values.is_extension_disabled;
					if (!disabled) {
						this.disableExtension();
					}					
				});	
			}
		};

		chrome.runtime.onMessage.addListener(this.processMessage);

		chrome.runtime.onInstalled.addListener(this.performInstallActions);

		//this.goToReviews = () => {
		//	chrome.tabs.create({
		//	url: "https://chrome.google.com/webstore/detail/youtube-audiovideo-sync/mknmhikmjljhpccebpnplhicmcfjkgbk/reviews"
		//  });
		//}

		this.goToSupport = () => {
			chrome.tabs.create({
			url: "https://chrome.google.com/webstore/detail/youtube-audiovideo-sync/mknmhikmjljhpccebpnplhicmcfjkgbk/support"
		  });
		}

		this.goToBuyMeACoffee = () => {
			chrome.tabs.create({
			url: "https://www.buymeacoffee.com/adrianilie"
		  });
		}

		chrome.contextMenus.create({
		  title: "⚙️ Support",
		  contexts: ["browser_action"],
		  onclick: this.goToSupport
		});

		//chrome.contextMenus.create({
		//  title: "🌟 Leave a review",
		//  contexts: ["browser_action"],
		//  onclick: this.goToReviews
		//});

		chrome.contextMenus.create({
		  title: "💳 Donate",
		  contexts: ["browser_action"],
		  onclick: this.goToBuyMeACoffee
		});

		chrome.runtime.setUninstallURL("https://docs.google.com/forms/d/e/1FAIpQLSd5gELqtwb9rJQgdK7SRAA5--fZQxTXDLNBIU2pOteHg1Kuig/viewform");
		//For firefox: https://docs.google.com/forms/d/e/1FAIpQLSd5gELqtwb9rJQgdK7SRAA5--fZQxTXDLNBIU2pOteHg1Kuig/viewform
    }
}
const background = new Background();
