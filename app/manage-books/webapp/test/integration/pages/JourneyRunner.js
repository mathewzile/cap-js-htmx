sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"managebooks/test/integration/pages/BooksList.gen",
	"managebooks/test/integration/pages/BooksObjectPage.gen",
	"managebooks/test/integration/pages/ChaptersObjectPage.gen"
], function (JourneyRunner, BooksListGenerated, BooksObjectPageGenerated, ChaptersObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('managebooks') + '/test/flp.html#app-preview',
        pages: {
			onTheBooksListGenerated: BooksListGenerated,
			onTheBooksObjectPageGenerated: BooksObjectPageGenerated,
			onTheChaptersObjectPageGenerated: ChaptersObjectPageGenerated
        },
        async: true
    });

    return runner;
});

