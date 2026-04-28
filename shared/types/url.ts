export type DataProvider = 'Kaggle' | 'HuggingFace' | 'CKAN' | 'GitHub' | 'Unknown'

export type URLScanResult = {
	sourceType: DataProvider
}