import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BIBLE_BOOKS, getBook, parseReference } from "../../../shared/bible";
import { HIGHLIGHT_COLORS, LIMITS, type HighlightColor } from "../../../shared/constants";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { Button, ErrorState, Field, IconButton, LoadingState, Row, Text } from "@/components/ui";
import { errorMessage, isUpgradeError, trpc } from "@/lib/api";
import { radius, spacing, useTheme } from "@/lib/theme";

const POSITION_KEY = "dg.bible.position";

export default function BibleReader() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ book?: string; chapter?: string; verse?: string }>();
  const [bookId, setBookId] = useState("JHN");
  const [chapter, setChapter] = useState(1);
  const [focusVerse, setFocusVerse] = useState<number | null>(null);
  const [picker, setPicker] = useState<"none" | "book" | "chapter">("none");
  const [pickerBook, setPickerBook] = useState("JHN");
  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  // Deep links (from Home or Bookmarks) move the reader; adjusting state during render
  // avoids an extra effect pass when params change.
  const paramKey = params.book && getBook(params.book) ? `${params.book}:${params.chapter}:${params.verse}` : null;
  const [seenParamKey, setSeenParamKey] = useState<string | null>(null);
  if (paramKey && paramKey !== seenParamKey) {
    setSeenParamKey(paramKey);
    setBookId(params.book!);
    setChapter(Number(params.chapter) || 1);
    setFocusVerse(params.verse ? Number(params.verse) : null);
  }

  // Otherwise restore the last position.
  useEffect(() => {
    if (paramKey) return;
    AsyncStorage.getItem(POSITION_KEY)
      .then((raw) => {
        const pos = raw ? (JSON.parse(raw) as { bookId: string; chapter: number }) : null;
        if (pos && getBook(pos.bookId)) {
          setBookId(pos.bookId);
          setChapter(pos.chapter);
        }
      })
      .catch(() => {});
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(POSITION_KEY, JSON.stringify({ bookId, chapter })).catch(() => {});
  }, [bookId, chapter]);

  const book = getBook(bookId)!;
  const text = trpc.bible.chapter.useQuery({ bookId, chapter });
  const notes = trpc.bible.annotations.useQuery({ bookId, chapter });

  useEffect(() => {
    if (!text.data || !focusVerse) return;
    const index = text.data.verses.findIndex((v) => v.verse === focusVerse);
    if (index >= 0) setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0, animated: true }), 300);
  }, [text.data, focusVerse]);

  function go(nextBook: string, nextChapter: number, verse?: number) {
    setBookId(nextBook);
    setChapter(nextChapter);
    setFocusVerse(verse ?? null);
    setSelected(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }

  function step(delta: 1 | -1) {
    const idx = BIBLE_BOOKS.findIndex((b) => b.id === bookId);
    if (delta === 1) {
      if (chapter < book.chapters) go(bookId, chapter + 1);
      else if (idx < BIBLE_BOOKS.length - 1) go(BIBLE_BOOKS[idx + 1].id, 1);
    } else {
      if (chapter > 1) go(bookId, chapter - 1);
      else if (idx > 0) go(BIBLE_BOOKS[idx - 1].id, BIBLE_BOOKS[idx - 1].chapters);
    }
  }

  function submitSearch() {
    const ref = parseReference(search);
    if (!ref) {
      setSearchError("Try a reference like “John 3:16” or “Psalm 23”.");
      return;
    }
    setSearchError(null);
    setSearch("");
    go(ref.bookId, ref.chapter, ref.verse);
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Pressable
            onPress={() => {
              setPickerBook(bookId);
              setPicker("book");
            }}
            accessibilityRole="button"
            accessibilityLabel={`${book.name} chapter ${chapter}. Change passage.`}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44 }}
          >
            <Text variant="heading">
              {book.name} {chapter}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.muted} />
          </Pressable>
          <Row gap={0}>
            <IconButton icon="chevron-back" label="Previous chapter" onPress={() => step(-1)} />
            <IconButton icon="chevron-forward" label="Next chapter" onPress={() => step(1)} />
          </Row>
        </Row>
        <Field placeholder="Go to… (e.g. Romans 8:28)" value={search} onChangeText={setSearch} onSubmitEditing={submitSearch} returnKeyType="go" error={searchError} />
      </View>

      {text.isLoading ? (
        <LoadingState />
      ) : text.error ? (
        <ErrorState message={errorMessage(text.error)} onRetry={() => text.refetch()} />
      ) : text.data ? (
        <FlatList
          ref={listRef}
          data={text.data.verses}
          keyExtractor={(v) => String(v.verse)}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          onScrollToIndexFailed={(info) => {
            // Rows far down haven't been measured yet: jump near them, then retry precisely.
            listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
            setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0, animated: true }), 250);
          }}
          renderItem={({ item }) => {
            const hl = notes.data?.highlights[item.verse];
            const bookmarked = notes.data?.bookmarks.includes(item.verse);
            const hasNote = !!notes.data?.notes[item.verse];
            return (
              <Pressable
                onPress={() => setSelected(item.verse)}
                accessibilityRole="button"
                accessibilityLabel={`Verse ${item.verse}. ${item.text}${bookmarked ? ". Bookmarked" : ""}${hasNote ? ". Has note" : ""}`}
                style={{
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.xs,
                  borderRadius: radius.sm,
                  backgroundColor: hl ? colors.highlight[hl] : focusVerse === item.verse ? colors.surface : "transparent",
                }}
              >
                <Text variant="scripture">
                  <Text variant="caption" color={colors.primary} style={{ fontWeight: "700" }}>
                    {item.verse}{" "}
                  </Text>
                  {item.text}
                  {bookmarked ? " 🔖" : ""}
                  {hasNote ? " ✎" : ""}
                </Text>
              </Pressable>
            );
          }}
          ListFooterComponent={
            <Text variant="caption" muted style={{ marginTop: spacing.xl, textAlign: "center" }}>
              {text.data.translationName} · {text.data.copyright}
            </Text>
          }
        />
      ) : null}

      <Modal visible={picker !== "none"} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicker("none")}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <Row style={{ justifyContent: "space-between", padding: spacing.lg }}>
            <Text variant="heading">{picker === "book" ? "Choose a book" : getBook(pickerBook)?.name}</Text>
            <IconButton icon="close" label="Close" onPress={() => setPicker("none")} />
          </Row>
          {picker === "book" ? (
            <FlatList
              data={BIBLE_BOOKS}
              keyExtractor={(b) => b.id}
              renderItem={({ item, index }) => (
                <>
                  {index === 0 || BIBLE_BOOKS[index - 1].testament !== item.testament ? (
                    <Text variant="caption" muted style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
                      {item.testament === "OT" ? "OLD TESTAMENT" : "NEW TESTAMENT"}
                    </Text>
                  ) : null}
                  <Pressable
                    onPress={() => {
                      setPickerBook(item.id);
                      setPicker("chapter");
                    }}
                    accessibilityRole="button"
                    style={{ paddingHorizontal: spacing.lg, minHeight: 48, justifyContent: "center", borderBottomColor: colors.border, borderBottomWidth: 0.5 }}
                  >
                    <Text color={item.id === bookId ? colors.primary : undefined}>{item.name}</Text>
                  </Pressable>
                </>
              )}
            />
          ) : (
            <FlatList
              data={Array.from({ length: getBook(pickerBook)?.chapters ?? 1 }, (_, i) => i + 1)}
              keyExtractor={(n) => String(n)}
              numColumns={5}
              contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
              columnWrapperStyle={{ gap: spacing.sm }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    go(pickerBook, item);
                    setPicker("none");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Chapter ${item}`}
                  style={{ flex: 1, aspectRatio: 1, maxWidth: "19%", borderRadius: radius.md, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}
                >
                  <Text variant="label">{item}</Text>
                </Pressable>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>

      {selected != null && text.data ? (
        <VerseActions
          bookId={bookId}
          chapter={chapter}
          verse={selected}
          verseText={text.data.verses.find((v) => v.verse === selected)?.text ?? ""}
          bookmarked={!!notes.data?.bookmarks.includes(selected)}
          highlight={notes.data?.highlights[selected] ?? null}
          note={notes.data?.notes[selected] ?? ""}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

function VerseActions(props: {
  bookId: string;
  chapter: number;
  verse: number;
  verseText: string;
  bookmarked: boolean;
  highlight: HighlightColor | null;
  note: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const utils = trpc.useUtils();
  const [note, setNote] = useState(props.note);
  const ref = { bookId: props.bookId, chapter: props.chapter, verse: props.verse };
  const invalidate = () => utils.bible.annotations.invalidate({ bookId: props.bookId, chapter: props.chapter });
  const bookmark = trpc.bible.toggleBookmark.useMutation({ onSuccess: invalidate });
  const highlight = trpc.bible.setHighlight.useMutation({ onSuccess: invalidate });
  const saveNote = trpc.bible.saveNote.useMutation({
    onSuccess: async () => {
      await invalidate();
      props.onClose();
    },
  });
  const error = bookmark.error ?? highlight.error ?? saveNote.error;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={props.onClose} accessibilityLabel="Close verse actions" />
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text variant="subheading">
            {getBook(props.bookId)?.name} {props.chapter}:{props.verse}
          </Text>
          <Text muted numberOfLines={3}>
            {props.verseText}
          </Text>

          <Row style={{ justifyContent: "space-between", flexWrap: "wrap", rowGap: spacing.md }}>
            <Button
              title={props.bookmarked ? "Bookmarked" : "Bookmark"}
              icon={props.bookmarked ? "bookmark" : "bookmark-outline"}
              variant="secondary"
              loading={bookmark.isPending}
              onPress={() => bookmark.mutate(ref)}
            />
            <Row>
              {HIGHLIGHT_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => highlight.mutate({ ...ref, color: props.highlight === c ? null : c })}
                  accessibilityRole="button"
                  accessibilityLabel={props.highlight === c ? `Remove ${c} highlight` : `Highlight ${c}`}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: colors.highlight[c],
                    borderWidth: props.highlight === c ? 3 : 1,
                    borderColor: props.highlight === c ? colors.primary : colors.border,
                  }}
                />
              ))}
            </Row>
          </Row>

          <Field label="Note" value={note} onChangeText={setNote} multiline maxLength={LIMITS.noteContent} placeholder="What is God showing you here?" />
          {error && isUpgradeError(error) ? <UpgradePrompt message={error.message} /> : error ? <Text color={colors.error}>{errorMessage(error)}</Text> : null}
          <Button title="Save note" loading={saveNote.isPending} disabled={note === props.note} onPress={() => saveNote.mutate({ ...ref, content: note })} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
