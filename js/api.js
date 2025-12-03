const API_CONFIG = {
    apiKey: '4759059607504e98ba567480d71df54e',
    url: 'https://api.trafikinfo.trafikverket.se/v2/data.json'
};

const TrafikverketAPI = {
    // Generisk funktion för anrop
    fetch: function(xmlQuery) {
        return $.ajax({
            url: API_CONFIG.url,
            method: 'POST',
            contentType: 'application/xml; charset=utf-8',
            dataType: 'json',
            data: `<REQUEST><LOGIN authenticationkey="${API_CONFIG.apiKey}" />${xmlQuery}</REQUEST>`
        });
    },

    // 1. Hämta stationsnamn (Översättningstabell)
    getAllStations: function() {
        const query = `
            <QUERY objecttype="TrainStation" schemaversion="1.4">
                <INCLUDE>LocationSignature</INCLUDE>
                <INCLUDE>AdvertisedLocationName</INCLUDE>
            </QUERY>
        `;
        return this.fetch(query);
    },

    // 2. Hämta alla tågpositioner (För kartan)
    getAllPositions: function() {
        const query = `
            <QUERY objecttype="TrainPosition" namespace="järnväg.trafikinfo" schemaversion="1.1" limit="3500">
                <FILTER>
                    <GT name="TimeStamp" value="${new Date(Date.now() - 15 * 60000).toISOString()}" />
                    <EXISTS name="Train.AdvertisedTrainNumber" value="true" />
                </FILTER>
                <INCLUDE>Train.AdvertisedTrainNumber</INCLUDE>
                <INCLUDE>Position.WGS84</INCLUDE>
                <INCLUDE>Bearing</INCLUDE>
                <INCLUDE>Speed</INCLUDE>
                <INCLUDE>TimeStamp</INCLUDE>
            </QUERY>
        `;
        return this.fetch(query);
    },

    // 3. Hämta metadata för aktiva tåg (För popupen)
    getActiveTrainData: function() {
        const query = `
            <QUERY objecttype="TrainAnnouncement" schemaversion="1.6" limit="5000">
                <FILTER>
                    <GT name="TimeAtLocation" value="${new Date(Date.now() - 60 * 60000).toISOString()}" />
                    <EQ name="ActivityType" value="Avgang" />
                    <EXISTS name="AdvertisedTrainIdent" value="true" />
                </FILTER>
                <INCLUDE>AdvertisedTrainIdent</INCLUDE>
                <INCLUDE>TechnicalTrainIdent</INCLUDE>
                <INCLUDE>Operator</INCLUDE>
                <INCLUDE>InformationOwner</INCLUDE>
                <INCLUDE>TimeAtLocation</INCLUDE>
                <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
                <INCLUDE>ProductInformation</INCLUDE>
                <INCLUDE>ToLocation</INCLUDE>
                <INCLUDE>LocationSignature</INCLUDE>
            </QUERY>
        `;
        return this.fetch(query);
    },

    // 4. Hämta specifikt tåg (Vid klick för att täppa till hål i data)
    getSpecificTrain: function(trainId) {
        const today = new Date().toLocaleDateString('sv-SE');
        const query = `
            <QUERY objecttype="TrainAnnouncement" schemaversion="1.6" limit="1" orderby="AdvertisedTimeAtLocation desc">
                <FILTER>
                    <EQ name="AdvertisedTrainIdent" value="${trainId}" />
                    <EQ name="ScheduledDepartureDateTime" value="${today}" />
                    <EXISTS name="TimeAtLocation" value="true" />
                </FILTER>
                <INCLUDE>TechnicalTrainIdent</INCLUDE>
                <INCLUDE>Operator</INCLUDE>
                <INCLUDE>InformationOwner</INCLUDE>
                <INCLUDE>ProductInformation</INCLUDE>
                <INCLUDE>ToLocation</INCLUDE>
                <INCLUDE>LocationSignature</INCLUDE>
                <INCLUDE>TimeAtLocation</INCLUDE>
                <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
            </QUERY>
        `;
        return this.fetch(query);
    },

    // 5. Hämta NÄSTA driftplats (För popupen)
    getNextStation: function(trainId) {
        const now = new Date().toISOString();
        const query = `
            <QUERY objecttype="TrainAnnouncement" schemaversion="1.6" limit="3" orderby="AdvertisedTimeAtLocation asc">
                <FILTER>
                    <EQ name="AdvertisedTrainIdent" value="${trainId}" />
                    <GT name="AdvertisedTimeAtLocation" value="${now}" />
                </FILTER>
                <INCLUDE>LocationSignature</INCLUDE>
                <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
                <INCLUDE>EstimatedTimeAtLocation</INCLUDE>
                <INCLUDE>TrackAtLocation</INCLUDE>
                <INCLUDE>ActivityType</INCLUDE>
            </QUERY>
        `;
        return this.fetch(query);
    },

    // 6. Hämta Plankorsningar (För checkboxen)
    getRailCrossings: function() {
        const query = `
            <QUERY objecttype="RailCrossing" schemaversion="1.5">
                <FILTER>
                    <EQ name="OperatingMode" value="I drift" />
                </FILTER>
                <INCLUDE>LevelCrossingId</INCLUDE>
                <INCLUDE>Geometry.WGS84</INCLUDE>
                <INCLUDE>RoadName</INCLUDE>
                <INCLUDE>NumberOfTracks</INCLUDE>
                <INCLUDE>OperatingMode</INCLUDE>
            </QUERY>
        `;
        return this.fetch(query);
    }
};

// Exportera till global scope
window.TrafikverketAPI = TrafikverketAPI;