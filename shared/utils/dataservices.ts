import { DataServiceBuilder } from "./builder";

// Export fill in:
// - dcterms:accessRights
// - conforms to https://www.w3.org/TR/vocab-dcat-3/#quality-conformance-statement
	// Ofterwijl wat voor source de provider levert (miss rdf, of sparql etc)
// contact point & creator (van de dataset), publisher
// description, title, release date, update/mopdification date, language
// identifier (id van de dataset)
// relation?
// license
// rights (all rights not addressed with dcterms:license)
// and more!

// LLM achtig
// theme/category 
// type/genre https://www.w3.org/TR/vocab-dcat-3/#Property:resource_type\
// keyword/tag



// TODO: To provide in this docuiment
export const baseKaggleBuilder = new DataServiceBuilder("https://www.kaggle.com/")
	.landingPage("https://www.kaggle.com/")
export const baseGithubBuilder = new DataServiceBuilder("https://github.com/")
export const baseHuggingFaceBuilder = new DataServiceBuilder("https://huggingface.co/")

