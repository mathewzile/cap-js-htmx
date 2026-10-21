sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"manageauthors/test/integration/pages/AuthorsList.gen",
	"manageauthors/test/integration/pages/AuthorsObjectPage.gen"
], function (JourneyRunner, AuthorsListGenerated, AuthorsObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('manageauthors') + '/test/flp.html#app-preview',
        pages: {
			onTheAuthorsListGenerated: AuthorsListGenerated,
			onTheAuthorsObjectPageGenerated: AuthorsObjectPageGenerated
        },
        async: true
    });

    return runner;
});

