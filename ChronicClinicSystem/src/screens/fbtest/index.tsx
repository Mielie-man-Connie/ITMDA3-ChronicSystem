import { db } from '../../config/firebaseConfig';
import { collection, getDocs, type DocumentData } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

const collectionNames = [
  'appointments',
  'clinics',
  'notifications',
  'queue',
  'tokens',
  'users',
] as const;

type CollectionResult = {
  name: (typeof collectionNames)[number];
  documents: { id: string; data: DocumentData }[];
  error?: string;
};

export default function App() {
  const [results, setResults] = useState<CollectionResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadCollections = async () => {
      const collectionResults = await Promise.all(
        collectionNames.map(async (name): Promise<CollectionResult> => {
          try {
            const snapshot = await getDocs(collection(db, name));
            return {
              name,
              documents: snapshot.docs.map((document) => ({
                id: document.id,
                data: document.data(),
              })),
            };
          } catch (error) {
            return {
              name,
              documents: [],
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );

      if (isMounted) {
        setResults(collectionResults);
        setLoading(false);
      }
    };

    void loadCollections();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Firebase database contents</Text>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.status}>Loading collections...</Text>
        </View>
      ) : null}

      {results.map((result) => (
        <View key={result.name} style={styles.collection}>
          <Text style={styles.collectionTitle}>
            {result.name} ({result.documents.length})
          </Text>
          {result.error ? (
            <Text style={styles.error}>Could not read collection: {result.error}</Text>
          ) : result.documents.length === 0 ? (
            <Text style={styles.status}>No documents found.</Text>
          ) : (
            result.documents.map((document) => (
              <View key={document.id} style={styles.document}>
                <Text style={styles.documentId}>Document ID: {document.id}</Text>
                <Text selectable style={styles.documentData}>
                  {JSON.stringify(document.data, null, 2)}
                </Text>
              </View>
            ))
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#f4f5f7',
  },
  title: {
    marginBottom: 16,
    fontSize: 24,
    fontWeight: '700',
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  status: {
    color: '#555',
    marginBottom: 8,
  },
  collection: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  collectionTitle: {
    marginBottom: 10,
    fontSize: 18,
    fontWeight: '700',
  },
  document: {
    marginTop: 8,
    padding: 10,
    borderRadius: 6,
    backgroundColor: '#f4f5f7',
  },
  documentId: {
    marginBottom: 6,
    fontWeight: '600',
  },
  documentData: {
    fontFamily: 'monospace',
  },
  error: {
    color: '#b00020',
  },
});