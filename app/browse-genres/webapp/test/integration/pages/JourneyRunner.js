sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"browsegenres/test/integration/pages/GenresList.gen",
	"browsegenres/test/integration/pages/GenresObjectPage.gen"
], function (JourneyRunner, GenresListGenerated, GenresObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('browsegenres') + '/test/flp.html#app-preview',
        pages: {
			onTheGenresListGenerated: GenresListGenerated,
			onTheGenresObjectPageGenerated: GenresObjectPageGenerated
        },
        async: true
    });

    return runner;
});

