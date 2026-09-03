package __PACKAGE__;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 긴 글을 말하기 좋은 문장/구 단위로 잘라줍니다.
 * 한 번에 너무 긴 덩어리를 TTS에 넣으면 끊기므로
 * 마침표·쉼표·줄바꿈 기준으로 잘라서 순서대로 읽습니다.
 */
public class SentenceSplitter {

    // 마침표/물음표/느낌표/줄바꿈/세미콜론/쉼표 뒤에서 자릅니다
    private static final Pattern SPLIT = Pattern.compile("[^.!?。…・\n,，;:]+(?:[.!?。…・\n,，;:]+|$)", Pattern.DOTALL);

    public static List<String> split(String text) {
        List<String> out = new ArrayList<>();
        if (text == null) return out;

        Matcher m = SPLIT.matcher(text);
        StringBuilder buf = new StringBuilder();
        while (m.find()) {
            String piece = m.group();
            if (piece == null) continue;
            piece = piece.trim();
            if (piece.isEmpty()) continue;

            // 너무 짧은 조각은 앞의 것과 합칩니다 (자연스러운 발음)
            buf.setLength(0);
            buf.append(piece);
            while (buf.length() < 3 && m.find()) {
                String nxt = m.group();
                if (nxt == null) break;
                nxt = nxt.trim();
                if (nxt.isEmpty()) break;
                buf.append(" ").append(nxt);
            }
            String finalPiece = buf.toString().replaceAll("\\s+", " ").trim();
            if (!finalPiece.isEmpty()) out.add(finalPiece);
        }
        return out;
    }
}
