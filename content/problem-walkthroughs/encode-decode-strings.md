---
problem: encode-decode-strings
args: [["a#b", "#"]]
frames: 27
source: 3aca0d42a9486ad5
---
@0
Two strings, chosen to be hostile. The first is a, hash, b. The second is a lone hash sign. Whatever separator you pick, the data can contain it, so joining with a separator and splitting on it is doomed. The insight: the decoder's real question is not where a string ends, but how many characters to read. Tell it that up front, and the content becomes opaque: nothing inside it can confuse the parser. This is length-prefix framing, the way most binary protocols mark out their fields.

@1-8
Encode writes each string as its length, a hash sign, then the content. The hash here is not a separator for the data. It only ends the length digits, so the decoder knows where the number stops. The first string has three characters, so it becomes 3, hash, a, hash, b. The second has one character, so it becomes 1, hash, hash. Joined, the encoding is 3, hash, a, hash, b, 1, hash, hash.

@9-13
Decode walks with an index i, starting at zero. It finds the first hash at or after i, which is at position 1. The digits before it, from position zero up to 1, read 3.

@14-17
The content starts just after that hash, at position 2, and we take exactly three characters: a, hash, b. The hash inside the data is never examined as a delimiter. We jump over it by count. Then i moves past the content, to position 5.

@18-22
From position 5, the next hash is at position 6, so the length is 1. The content starts at position 7, and we take one character: the hash sign itself. Again, taken by count, not by searching. The output now holds both strings, and i is 8, the end of the encoding.

@23-26
The loop ends, and the round trip gives back exactly a, hash, b, and hash. Both directions are linear in the total number of characters.

Test the edges out loud. An empty list encodes to an empty string and decodes back to an empty list. A list holding one empty string encodes to zero, hash, and decodes back to that one empty string, so the two cases stay distinct. The mistakes: splitting on the hash anywhere in the decoder; writing the length with no terminator, so 1 followed by 2abc looks the same as 12 followed by abc; and counting length in bytes on one side and characters on the other.
