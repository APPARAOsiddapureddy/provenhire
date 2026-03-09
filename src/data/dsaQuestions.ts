export type ProgrammingLanguage = 'javascript' | 'python' | 'java' | 'cpp' | 'c';

export interface LanguageTemplate {
  language: ProgrammingLanguage;
  displayName: string;
  extension: string;
  template: string;
}

export interface DSAQuestion {
  id: string;
  difficulty: "Easy" | "Medium" | "Hard";
  title: string;
  description: string;
  examples: { input: string; output: string; explanation?: string }[];
  constraints: string[];
  testCases: { input: string; expectedOutput: string }[];
  hints: string[];
  topic: string;
  functionName: string;
  templates: Record<ProgrammingLanguage, string>;
}

// Language configurations
export const supportedLanguages: LanguageTemplate[] = [
  {
    language: 'javascript',
    displayName: 'JavaScript',
    extension: 'js',
    template: '// JavaScript Solution\n',
  },
  {
    language: 'python',
    displayName: 'Python',
    extension: 'py',
    template: '# Python Solution\n',
  },
  {
    language: 'java',
    displayName: 'Java',
    extension: 'java',
    template: '// Java Solution\n',
  },
  {
    language: 'cpp',
    displayName: 'C++',
    extension: 'cpp',
    template: '// C++ Solution\n',
  },
  {
    language: 'c',
    displayName: 'C',
    extension: 'c',
    template: '// C Solution\n',
  },
];

export const dsaQuestions: DSAQuestion[] = [
  // Easy Questions
  {
    id: "DSA_E001",
    difficulty: "Easy",
    title: "Two Sum",
    description: "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice.",
    examples: [
      { input: "nums = [2,7,11,15], target = 9", output: "[0,1]", explanation: "Because nums[0] + nums[1] == 9, we return [0, 1]." },
      { input: "nums = [3,2,4], target = 6", output: "[1,2]" },
      { input: "nums = [3,3], target = 6", output: "[0,1]" }
    ],
    constraints: [
      "2 <= nums.length <= 10^4",
      "-10^9 <= nums[i] <= 10^9",
      "-10^9 <= target <= 10^9",
      "Only one valid answer exists."
    ],
    testCases: [
      { input: "[2,7,11,15]\n9", expectedOutput: "[0,1]" },
      { input: "[3,2,4]\n6", expectedOutput: "[1,2]" },
      { input: "[3,3]\n6", expectedOutput: "[0,1]" }
    ],
    hints: [
      "A brute force approach would be to check every pair of numbers.",
      "Can you reduce the time complexity using a hash map?",
      "Store each number's index as you iterate, and check if the complement exists."
    ],
    topic: "Arrays & Hash Table",
    functionName: "twoSum",
    templates: {
      javascript: `/**
 * @param {number[]} nums - Array of integers
 * @param {number} target - Target sum
 * @return {number[]} - Indices of the two numbers
 */
function twoSum(nums, target) {
    // TODO: Implement your solution here
    
    // Hint: Use a hash map to store seen values
    // Time Complexity: O(n)
    // Space Complexity: O(n)
    
    return [];
}

// Test your solution
const nums = [2, 7, 11, 15];
const target = 9;
console.log(twoSum(nums, target)); // Expected: [0, 1]`,

      python: `from typing import List

class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        """
        Find two numbers that add up to target.
        
        Args:
            nums: List of integers
            target: Target sum
            
        Returns:
            List containing indices of the two numbers
        """
        # TODO: Implement your solution here
        
        # Hint: Use a dictionary to store seen values
        # Time Complexity: O(n)
        # Space Complexity: O(n)
        
        return []


# Test your solution
if __name__ == "__main__":
    solution = Solution()
    nums = [2, 7, 11, 15]
    target = 9
    print(solution.twoSum(nums, target))  # Expected: [0, 1]`,

      java: `import java.util.*;

class Solution {
    /**
     * Find two numbers that add up to target.
     * 
     * @param nums   Array of integers
     * @param target Target sum
     * @return Indices of the two numbers
     */
    public int[] twoSum(int[] nums, int target) {
        // TODO: Implement your solution here
        
        // Hint: Use a HashMap to store seen values
        // Time Complexity: O(n)
        // Space Complexity: O(n)
        
        return new int[]{};
    }
    
    public static void main(String[] args) {
        Solution solution = new Solution();
        int[] nums = {2, 7, 11, 15};
        int target = 9;
        int[] result = solution.twoSum(nums, target);
        System.out.println(Arrays.toString(result)); // Expected: [0, 1]
    }
}`,

      cpp: `#include <iostream>
#include <vector>
#include <unordered_map>
using namespace std;

class Solution {
public:
    /**
     * Find two numbers that add up to target.
     * 
     * @param nums   Vector of integers
     * @param target Target sum
     * @return Vector containing indices of the two numbers
     */
    vector<int> twoSum(vector<int>& nums, int target) {
        // TODO: Implement your solution here
        
        // Hint: Use an unordered_map to store seen values
        // Time Complexity: O(n)
        // Space Complexity: O(n)
        
        return {};
    }
};

int main() {
    Solution solution;
    vector<int> nums = {2, 7, 11, 15};
    int target = 9;
    vector<int> result = solution.twoSum(nums, target);
    cout << "[" << result[0] << ", " << result[1] << "]" << endl; // Expected: [0, 1]
    return 0;
}`,

      c: `#include <stdio.h>
#include <stdlib.h>

/**
 * Find two numbers that add up to target.
 * 
 * Note: The returned array must be malloced, caller is responsible for freeing.
 * 
 * @param nums     Array of integers
 * @param numsSize Size of the array
 * @param target   Target sum
 * @param returnSize Pointer to store result size
 * @return Array containing indices of the two numbers
 */
int* twoSum(int* nums, int numsSize, int target, int* returnSize) {
    // TODO: Implement your solution here
    
    // Hint: Use nested loops or implement a hash table
    // Time Complexity: O(n^2) for brute force, O(n) with hash table
    
    *returnSize = 2;
    int* result = (int*)malloc(2 * sizeof(int));
    result[0] = -1;
    result[1] = -1;
    return result;
}

int main() {
    int nums[] = {2, 7, 11, 15};
    int target = 9;
    int returnSize;
    int* result = twoSum(nums, 4, target, &returnSize);
    printf("[%d, %d]\\n", result[0], result[1]); // Expected: [0, 1]
    free(result);
    return 0;
}`
    }
  },
  {
    id: "DSA_E002",
    difficulty: "Easy",
    title: "Reverse a String",
    description: "Write a function that reverses a string. The input string is given as an array of characters s. You must do this by modifying the input array in-place with O(1) extra memory.",
    examples: [
      { input: 's = ["h","e","l","l","o"]', output: '["o","l","l","e","h"]' },
      { input: 's = ["H","a","n","n","a","h"]', output: '["h","a","n","n","a","H"]' }
    ],
    constraints: [
      "1 <= s.length <= 10^5",
      "s[i] is a printable ASCII character."
    ],
    testCases: [
      { input: '["h","e","l","l","o"]', expectedOutput: '["o","l","l","e","h"]' },
      { input: '["a","b","c"]', expectedOutput: '["c","b","a"]' }
    ],
    hints: [
      "Use two pointers technique",
      "Start from both ends and swap characters",
      "Continue until the pointers meet in the middle"
    ],
    topic: "Two Pointers",
    functionName: "reverseString",
    templates: {
      javascript: `/**
 * Reverse string in-place.
 * @param {character[]} s - Array of characters
 * @return {void} Do not return anything, modify s in-place instead.
 */
function reverseString(s) {
    // TODO: Implement your solution here
    
    // Hint: Use two pointers from both ends
    // Time Complexity: O(n)
    // Space Complexity: O(1)
}

// Test your solution
let s = ["h", "e", "l", "l", "o"];
reverseString(s);
console.log(s); // Expected: ["o", "l", "l", "e", "h"]`,

      python: `from typing import List

class Solution:
    def reverseString(self, s: List[str]) -> None:
        """
        Reverse string in-place. Do not return anything.
        
        Args:
            s: List of characters to reverse
        """
        # TODO: Implement your solution here
        
        # Hint: Use two pointers from both ends
        # Time Complexity: O(n)
        # Space Complexity: O(1)
        pass


# Test your solution
if __name__ == "__main__":
    solution = Solution()
    s = ["h", "e", "l", "l", "o"]
    solution.reverseString(s)
    print(s)  # Expected: ["o", "l", "l", "e", "h"]`,

      java: `class Solution {
    /**
     * Reverse string in-place.
     * 
     * @param s Array of characters to reverse
     */
    public void reverseString(char[] s) {
        // TODO: Implement your solution here
        
        // Hint: Use two pointers from both ends
        // Time Complexity: O(n)
        // Space Complexity: O(1)
    }
    
    public static void main(String[] args) {
        Solution solution = new Solution();
        char[] s = {'h', 'e', 'l', 'l', 'o'};
        solution.reverseString(s);
        System.out.println(java.util.Arrays.toString(s)); // Expected: [o, l, l, e, h]
    }
}`,

      cpp: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

class Solution {
public:
    /**
     * Reverse string in-place.
     * 
     * @param s Vector of characters to reverse
     */
    void reverseString(vector<char>& s) {
        // TODO: Implement your solution here
        
        // Hint: Use two pointers from both ends
        // Time Complexity: O(n)
        // Space Complexity: O(1)
    }
};

int main() {
    Solution solution;
    vector<char> s = {'h', 'e', 'l', 'l', 'o'};
    solution.reverseString(s);
    for (char c : s) cout << c;
    cout << endl; // Expected: olleh
    return 0;
}`,

      c: `#include <stdio.h>
#include <string.h>

/**
 * Reverse string in-place.
 * 
 * @param s     Array of characters
 * @param sSize Size of the array
 */
void reverseString(char* s, int sSize) {
    // TODO: Implement your solution here
    
    // Hint: Use two pointers from both ends
    // Time Complexity: O(n)
    // Space Complexity: O(1)
}

int main() {
    char s[] = {'h', 'e', 'l', 'l', 'o'};
    int size = 5;
    reverseString(s, size);
    for (int i = 0; i < size; i++) printf("%c", s[i]);
    printf("\\n"); // Expected: olleh
    return 0;
}`
    }
  },
  {
    id: "DSA_E003",
    difficulty: "Easy",
    title: "Valid Parentheses",
    description: "Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid. An input string is valid if: Open brackets must be closed by the same type of brackets, and open brackets must be closed in the correct order. Every close bracket has a corresponding open bracket of the same type.",
    examples: [
      { input: 's = "()"', output: "true" },
      { input: 's = "()[]{}"', output: "true" },
      { input: 's = "(]"', output: "false" }
    ],
    constraints: [
      "1 <= s.length <= 10^4",
      "s consists of parentheses only '()[]{}'"
    ],
    testCases: [
      { input: "()", expectedOutput: "true" },
      { input: "()[]{}", expectedOutput: "true" },
      { input: "(]", expectedOutput: "false" },
      { input: "([)]", expectedOutput: "false" }
    ],
    hints: [
      "Use a stack data structure",
      "Push opening brackets onto the stack",
      "For closing brackets, check if it matches the top of stack"
    ],
    topic: "Stack",
    functionName: "isValid",
    templates: {
      javascript: `/**
 * Determine if the input string has valid parentheses.
 * @param {string} s - String containing brackets
 * @return {boolean} - True if valid, false otherwise
 */
function isValid(s) {
    // TODO: Implement your solution here
    
    // Hint: Use a stack to track opening brackets
    // Time Complexity: O(n)
    // Space Complexity: O(n)
    
    return false;
}

// Test your solution
console.log(isValid("()")); // Expected: true
console.log(isValid("()[]{}")); // Expected: true
console.log(isValid("(]")); // Expected: false`,

      python: `class Solution:
    def isValid(self, s: str) -> bool:
        """
        Determine if the input string has valid parentheses.
        
        Args:
            s: String containing brackets
            
        Returns:
            True if valid, False otherwise
        """
        # TODO: Implement your solution here
        
        # Hint: Use a stack to track opening brackets
        # Time Complexity: O(n)
        # Space Complexity: O(n)
        
        return False


# Test your solution
if __name__ == "__main__":
    solution = Solution()
    print(solution.isValid("()"))  # Expected: True
    print(solution.isValid("()[]{}"))  # Expected: True
    print(solution.isValid("(]"))  # Expected: False`,

      java: `import java.util.*;

class Solution {
    /**
     * Determine if the input string has valid parentheses.
     * 
     * @param s String containing brackets
     * @return True if valid, false otherwise
     */
    public boolean isValid(String s) {
        // TODO: Implement your solution here
        
        // Hint: Use a Stack to track opening brackets
        // Time Complexity: O(n)
        // Space Complexity: O(n)
        
        return false;
    }
    
    public static void main(String[] args) {
        Solution solution = new Solution();
        System.out.println(solution.isValid("()")); // Expected: true
        System.out.println(solution.isValid("()[]{}")); // Expected: true
        System.out.println(solution.isValid("(]")); // Expected: false
    }
}`,

      cpp: `#include <iostream>
#include <stack>
#include <string>
using namespace std;

class Solution {
public:
    /**
     * Determine if the input string has valid parentheses.
     * 
     * @param s String containing brackets
     * @return True if valid, false otherwise
     */
    bool isValid(string s) {
        // TODO: Implement your solution here
        
        // Hint: Use a stack to track opening brackets
        // Time Complexity: O(n)
        // Space Complexity: O(n)
        
        return false;
    }
};

int main() {
    Solution solution;
    cout << boolalpha;
    cout << solution.isValid("()") << endl; // Expected: true
    cout << solution.isValid("()[]{}") << endl; // Expected: true
    cout << solution.isValid("(]") << endl; // Expected: false
    return 0;
}`,

      c: `#include <stdio.h>
#include <stdbool.h>
#include <string.h>

/**
 * Determine if the input string has valid parentheses.
 * 
 * @param s String containing brackets
 * @return True if valid, false otherwise
 */
bool isValid(char* s) {
    // TODO: Implement your solution here
    
    // Hint: Implement a stack using an array
    // Time Complexity: O(n)
    // Space Complexity: O(n)
    
    return false;
}

int main() {
    printf("%s\\n", isValid("()") ? "true" : "false"); // Expected: true
    printf("%s\\n", isValid("()[]{}") ? "true" : "false"); // Expected: true
    printf("%s\\n", isValid("(]") ? "true" : "false"); // Expected: false
    return 0;
}`
    }
  },
  // Medium Questions
  {
    id: "DSA_M001",
    difficulty: "Medium",
    title: "Longest Substring Without Repeating Characters",
    description: "Given a string s, find the length of the longest substring without repeating characters.",
    examples: [
      { input: 's = "abcabcbb"', output: "3", explanation: 'The answer is "abc", with the length of 3.' },
      { input: 's = "bbbbb"', output: "1", explanation: 'The answer is "b", with the length of 1.' },
      { input: 's = "pwwkew"', output: "3", explanation: 'The answer is "wke", with the length of 3.' }
    ],
    constraints: [
      "0 <= s.length <= 5 * 10^4",
      "s consists of English letters, digits, symbols and spaces."
    ],
    testCases: [
      { input: "abcabcbb", expectedOutput: "3" },
      { input: "bbbbb", expectedOutput: "1" },
      { input: "pwwkew", expectedOutput: "3" }
    ],
    hints: [
      "Use sliding window technique",
      "Keep track of character positions in a hash map",
      "When you find a duplicate, move the left pointer"
    ],
    topic: "Sliding Window",
    functionName: "lengthOfLongestSubstring",
    templates: {
      javascript: `/**
 * Find the length of the longest substring without repeating characters.
 * @param {string} s - Input string
 * @return {number} - Length of longest substring
 */
function lengthOfLongestSubstring(s) {
    // TODO: Implement your solution here
    
    // Hint: Use sliding window with a Set or Map
    // Time Complexity: O(n)
    // Space Complexity: O(min(m, n)) where m is charset size
    
    return 0;
}

// Test your solution
console.log(lengthOfLongestSubstring("abcabcbb")); // Expected: 3
console.log(lengthOfLongestSubstring("bbbbb")); // Expected: 1
console.log(lengthOfLongestSubstring("pwwkew")); // Expected: 3`,

      python: `class Solution:
    def lengthOfLongestSubstring(self, s: str) -> int:
        """
        Find the length of the longest substring without repeating characters.
        
        Args:
            s: Input string
            
        Returns:
            Length of longest substring
        """
        # TODO: Implement your solution here
        
        # Hint: Use sliding window with a set or dict
        # Time Complexity: O(n)
        # Space Complexity: O(min(m, n)) where m is charset size
        
        return 0


# Test your solution
if __name__ == "__main__":
    solution = Solution()
    print(solution.lengthOfLongestSubstring("abcabcbb"))  # Expected: 3
    print(solution.lengthOfLongestSubstring("bbbbb"))  # Expected: 1
    print(solution.lengthOfLongestSubstring("pwwkew"))  # Expected: 3`,

      java: `import java.util.*;

class Solution {
    /**
     * Find the length of the longest substring without repeating characters.
     * 
     * @param s Input string
     * @return Length of longest substring
     */
    public int lengthOfLongestSubstring(String s) {
        // TODO: Implement your solution here
        
        // Hint: Use sliding window with a HashMap or HashSet
        // Time Complexity: O(n)
        // Space Complexity: O(min(m, n)) where m is charset size
        
        return 0;
    }
    
    public static void main(String[] args) {
        Solution solution = new Solution();
        System.out.println(solution.lengthOfLongestSubstring("abcabcbb")); // Expected: 3
        System.out.println(solution.lengthOfLongestSubstring("bbbbb")); // Expected: 1
        System.out.println(solution.lengthOfLongestSubstring("pwwkew")); // Expected: 3
    }
}`,

      cpp: `#include <iostream>
#include <string>
#include <unordered_set>
#include <unordered_map>
using namespace std;

class Solution {
public:
    /**
     * Find the length of the longest substring without repeating characters.
     * 
     * @param s Input string
     * @return Length of longest substring
     */
    int lengthOfLongestSubstring(string s) {
        // TODO: Implement your solution here
        
        // Hint: Use sliding window with unordered_set or unordered_map
        // Time Complexity: O(n)
        // Space Complexity: O(min(m, n)) where m is charset size
        
        return 0;
    }
};

int main() {
    Solution solution;
    cout << solution.lengthOfLongestSubstring("abcabcbb") << endl; // Expected: 3
    cout << solution.lengthOfLongestSubstring("bbbbb") << endl; // Expected: 1
    cout << solution.lengthOfLongestSubstring("pwwkew") << endl; // Expected: 3
    return 0;
}`,

      c: `#include <stdio.h>
#include <string.h>

/**
 * Find the length of the longest substring without repeating characters.
 * 
 * @param s Input string
 * @return Length of longest substring
 */
int lengthOfLongestSubstring(char* s) {
    // TODO: Implement your solution here
    
    // Hint: Use an array to track last occurrence of each character
    // Time Complexity: O(n)
    // Space Complexity: O(1) - fixed size array for ASCII
    
    return 0;
}

int main() {
    printf("%d\\n", lengthOfLongestSubstring("abcabcbb")); // Expected: 3
    printf("%d\\n", lengthOfLongestSubstring("bbbbb")); // Expected: 1
    printf("%d\\n", lengthOfLongestSubstring("pwwkew")); // Expected: 3
    return 0;
}`
    }
  },
  {
    id: "DSA_M002",
    difficulty: "Medium",
    title: "Container With Most Water",
    description: "You are given an integer array height of length n. There are n vertical lines drawn such that the two endpoints of the ith line are (i, 0) and (i, height[i]). Find two lines that together with the x-axis form a container, such that the container contains the most water. Return the maximum amount of water a container can store.",
    examples: [
      { input: "height = [1,8,6,2,5,4,8,3,7]", output: "49", explanation: "The vertical lines are drawn at indices 1 and 8. The container holds 49 units of water." }
    ],
    constraints: [
      "n == height.length",
      "2 <= n <= 10^5",
      "0 <= height[i] <= 10^4"
    ],
    testCases: [
      { input: "[1,8,6,2,5,4,8,3,7]", expectedOutput: "49" },
      { input: "[1,1]", expectedOutput: "1" }
    ],
    hints: [
      "Use two pointers from both ends",
      "Move the pointer pointing to the shorter line",
      "The area is limited by the shorter line"
    ],
    topic: "Two Pointers",
    functionName: "maxArea",
    templates: {
      javascript: `/**
 * Find the maximum amount of water a container can store.
 * @param {number[]} height - Array of heights
 * @return {number} - Maximum water area
 */
function maxArea(height) {
    // TODO: Implement your solution here
    
    // Hint: Use two pointers from both ends
    // Move the pointer with smaller height
    // Time Complexity: O(n)
    // Space Complexity: O(1)
    
    return 0;
}

// Test your solution
console.log(maxArea([1,8,6,2,5,4,8,3,7])); // Expected: 49
console.log(maxArea([1,1])); // Expected: 1`,

      python: `from typing import List

class Solution:
    def maxArea(self, height: List[int]) -> int:
        """
        Find the maximum amount of water a container can store.
        
        Args:
            height: List of heights
            
        Returns:
            Maximum water area
        """
        # TODO: Implement your solution here
        
        # Hint: Use two pointers from both ends
        # Move the pointer with smaller height
        # Time Complexity: O(n)
        # Space Complexity: O(1)
        
        return 0


# Test your solution
if __name__ == "__main__":
    solution = Solution()
    print(solution.maxArea([1,8,6,2,5,4,8,3,7]))  # Expected: 49
    print(solution.maxArea([1,1]))  # Expected: 1`,

      java: `class Solution {
    /**
     * Find the maximum amount of water a container can store.
     * 
     * @param height Array of heights
     * @return Maximum water area
     */
    public int maxArea(int[] height) {
        // TODO: Implement your solution here
        
        // Hint: Use two pointers from both ends
        // Move the pointer with smaller height
        // Time Complexity: O(n)
        // Space Complexity: O(1)
        
        return 0;
    }
    
    public static void main(String[] args) {
        Solution solution = new Solution();
        System.out.println(solution.maxArea(new int[]{1,8,6,2,5,4,8,3,7})); // Expected: 49
        System.out.println(solution.maxArea(new int[]{1,1})); // Expected: 1
    }
}`,

      cpp: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

class Solution {
public:
    /**
     * Find the maximum amount of water a container can store.
     * 
     * @param height Vector of heights
     * @return Maximum water area
     */
    int maxArea(vector<int>& height) {
        // TODO: Implement your solution here
        
        // Hint: Use two pointers from both ends
        // Move the pointer with smaller height
        // Time Complexity: O(n)
        // Space Complexity: O(1)
        
        return 0;
    }
};

int main() {
    Solution solution;
    vector<int> height1 = {1,8,6,2,5,4,8,3,7};
    vector<int> height2 = {1,1};
    cout << solution.maxArea(height1) << endl; // Expected: 49
    cout << solution.maxArea(height2) << endl; // Expected: 1
    return 0;
}`,

      c: `#include <stdio.h>

/**
 * Find the maximum amount of water a container can store.
 * 
 * @param height     Array of heights
 * @param heightSize Size of the array
 * @return Maximum water area
 */
int maxArea(int* height, int heightSize) {
    // TODO: Implement your solution here
    
    // Hint: Use two pointers from both ends
    // Move the pointer with smaller height
    // Time Complexity: O(n)
    // Space Complexity: O(1)
    
    return 0;
}

int main() {
    int height1[] = {1,8,6,2,5,4,8,3,7};
    int height2[] = {1,1};
    printf("%d\\n", maxArea(height1, 9)); // Expected: 49
    printf("%d\\n", maxArea(height2, 2)); // Expected: 1
    return 0;
}`
    }
  },
  {
    id: "DSA_M003",
    difficulty: "Medium",
    title: "Binary Search",
    description: "Given an array of integers nums which is sorted in ascending order, and an integer target, write a function to search target in nums. If target exists, then return its index. Otherwise, return -1. You must write an algorithm with O(log n) runtime complexity.",
    examples: [
      { input: "nums = [-1,0,3,5,9,12], target = 9", output: "4", explanation: "9 exists in nums and its index is 4" },
      { input: "nums = [-1,0,3,5,9,12], target = 2", output: "-1", explanation: "2 does not exist in nums so return -1" }
    ],
    constraints: [
      "1 <= nums.length <= 10^4",
      "-10^4 < nums[i], target < 10^4",
      "All the integers in nums are unique.",
      "nums is sorted in ascending order."
    ],
    testCases: [
      { input: "[-1,0,3,5,9,12]\n9", expectedOutput: "4" },
      { input: "[-1,0,3,5,9,12]\n2", expectedOutput: "-1" }
    ],
    hints: [
      "Use two pointers: left and right",
      "Calculate mid and compare with target",
      "Adjust left or right based on comparison"
    ],
    topic: "Binary Search",
    functionName: "search",
    templates: {
      javascript: `/**
 * Search for target in sorted array using binary search.
 * @param {number[]} nums - Sorted array of integers
 * @param {number} target - Target value to find
 * @return {number} - Index of target, or -1 if not found
 */
function search(nums, target) {
    // TODO: Implement your solution here
    
    // Hint: Use binary search - O(log n) time
    // Maintain left and right pointers
    // Compare middle element with target
    
    return -1;
}

// Test your solution
console.log(search([-1,0,3,5,9,12], 9)); // Expected: 4
console.log(search([-1,0,3,5,9,12], 2)); // Expected: -1`,

      python: `from typing import List

class Solution:
    def search(self, nums: List[int], target: int) -> int:
        """
        Search for target in sorted array using binary search.
        
        Args:
            nums: Sorted list of integers
            target: Target value to find
            
        Returns:
            Index of target, or -1 if not found
        """
        # TODO: Implement your solution here
        
        # Hint: Use binary search - O(log n) time
        # Maintain left and right pointers
        # Compare middle element with target
        
        return -1


# Test your solution
if __name__ == "__main__":
    solution = Solution()
    print(solution.search([-1,0,3,5,9,12], 9))  # Expected: 4
    print(solution.search([-1,0,3,5,9,12], 2))  # Expected: -1`,

      java: `class Solution {
    /**
     * Search for target in sorted array using binary search.
     * 
     * @param nums   Sorted array of integers
     * @param target Target value to find
     * @return Index of target, or -1 if not found
     */
    public int search(int[] nums, int target) {
        // TODO: Implement your solution here
        
        // Hint: Use binary search - O(log n) time
        // Maintain left and right pointers
        // Compare middle element with target
        
        return -1;
    }
    
    public static void main(String[] args) {
        Solution solution = new Solution();
        System.out.println(solution.search(new int[]{-1,0,3,5,9,12}, 9)); // Expected: 4
        System.out.println(solution.search(new int[]{-1,0,3,5,9,12}, 2)); // Expected: -1
    }
}`,

      cpp: `#include <iostream>
#include <vector>
using namespace std;

class Solution {
public:
    /**
     * Search for target in sorted array using binary search.
     * 
     * @param nums   Sorted vector of integers
     * @param target Target value to find
     * @return Index of target, or -1 if not found
     */
    int search(vector<int>& nums, int target) {
        // TODO: Implement your solution here
        
        // Hint: Use binary search - O(log n) time
        // Maintain left and right pointers
        // Compare middle element with target
        
        return -1;
    }
};

int main() {
    Solution solution;
    vector<int> nums = {-1,0,3,5,9,12};
    cout << solution.search(nums, 9) << endl; // Expected: 4
    cout << solution.search(nums, 2) << endl; // Expected: -1
    return 0;
}`,

      c: `#include <stdio.h>

/**
 * Search for target in sorted array using binary search.
 * 
 * @param nums     Sorted array of integers
 * @param numsSize Size of the array
 * @param target   Target value to find
 * @return Index of target, or -1 if not found
 */
int search(int* nums, int numsSize, int target) {
    // TODO: Implement your solution here
    
    // Hint: Use binary search - O(log n) time
    // Maintain left and right pointers
    // Compare middle element with target
    
    return -1;
}

int main() {
    int nums[] = {-1,0,3,5,9,12};
    printf("%d\\n", search(nums, 6, 9)); // Expected: 4
    printf("%d\\n", search(nums, 6, 2)); // Expected: -1
    return 0;
}`
    }
  },
  // Hard Questions
  {
    id: "DSA_H001",
    difficulty: "Hard",
    title: "Merge K Sorted Lists",
    description: "You are given an array of k linked-lists lists, each linked-list is sorted in ascending order. Merge all the linked-lists into one sorted linked-list and return it.",
    examples: [
      { input: "lists = [[1,4,5],[1,3,4],[2,6]]", output: "[1,1,2,3,4,4,5,6]", explanation: "Merge all sorted linked lists into one sorted list." },
      { input: "lists = []", output: "[]" },
      { input: "lists = [[]]", output: "[]" }
    ],
    constraints: [
      "k == lists.length",
      "0 <= k <= 10^4",
      "0 <= lists[i].length <= 500",
      "-10^4 <= lists[i][j] <= 10^4",
      "lists[i] is sorted in ascending order.",
      "The sum of lists[i].length will not exceed 10^4."
    ],
    testCases: [
      { input: "[[1,4,5],[1,3,4],[2,6]]", expectedOutput: "[1,1,2,3,4,4,5,6]" },
      { input: "[]", expectedOutput: "[]" }
    ],
    hints: [
      "Use a min-heap/priority queue to always get the smallest element",
      "Alternative: Divide and conquer - merge lists pairwise",
      "Think about how to merge two sorted lists efficiently"
    ],
    topic: "Heap / Priority Queue",
    functionName: "mergeKLists",
    templates: {
      javascript: `/**
 * Definition for singly-linked list.
 */
class ListNode {
    constructor(val = 0, next = null) {
        this.val = val;
        this.next = next;
    }
}

/**
 * Merge k sorted linked lists.
 * @param {ListNode[]} lists - Array of linked list heads
 * @return {ListNode} - Head of merged sorted list
 */
function mergeKLists(lists) {
    // TODO: Implement your solution here
    
    // Approach 1: Min-Heap
    // - Add all list heads to a min-heap
    // - Extract min, add to result, push next node
    // Time: O(N log k), Space: O(k)
    
    // Approach 2: Divide and Conquer
    // - Merge lists pairwise until one list remains
    // Time: O(N log k), Space: O(1)
    
    return null;
}

// Helper to create list from array
function createList(arr) {
    if (!arr.length) return null;
    let head = new ListNode(arr[0]);
    let current = head;
    for (let i = 1; i < arr.length; i++) {
        current.next = new ListNode(arr[i]);
        current = current.next;
    }
    return head;
}

// Test your solution
const lists = [
    createList([1, 4, 5]),
    createList([1, 3, 4]),
    createList([2, 6])
];
let result = mergeKLists(lists);
// Print result: Expected [1,1,2,3,4,4,5,6]`,

      python: `from typing import List, Optional
import heapq

class ListNode:
    def __init__(self, val: int = 0, next: 'ListNode' = None):
        self.val = val
        self.next = next

class Solution:
    def mergeKLists(self, lists: List[Optional[ListNode]]) -> Optional[ListNode]:
        """
        Merge k sorted linked lists.
        
        Args:
            lists: List of linked list heads
            
        Returns:
            Head of merged sorted list
        """
        # TODO: Implement your solution here
        
        # Approach 1: Min-Heap (using heapq)
        # - Add all list heads to a min-heap
        # - Extract min, add to result, push next node
        # Time: O(N log k), Space: O(k)
        
        # Approach 2: Divide and Conquer
        # - Merge lists pairwise until one list remains
        # Time: O(N log k), Space: O(1)
        
        return None


# Helper to create list from array
def create_list(arr):
    if not arr:
        return None
    head = ListNode(arr[0])
    current = head
    for val in arr[1:]:
        current.next = ListNode(val)
        current = current.next
    return head


# Test your solution
if __name__ == "__main__":
    solution = Solution()
    lists = [
        create_list([1, 4, 5]),
        create_list([1, 3, 4]),
        create_list([2, 6])
    ]
    result = solution.mergeKLists(lists)
    # Expected: 1 -> 1 -> 2 -> 3 -> 4 -> 4 -> 5 -> 6`,

      java: `import java.util.*;

class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

class Solution {
    /**
     * Merge k sorted linked lists.
     * 
     * @param lists Array of linked list heads
     * @return Head of merged sorted list
     */
    public ListNode mergeKLists(ListNode[] lists) {
        // TODO: Implement your solution here
        
        // Approach 1: PriorityQueue (Min-Heap)
        // - Add all list heads to a PriorityQueue
        // - Poll min, add to result, offer next node
        // Time: O(N log k), Space: O(k)
        
        // Approach 2: Divide and Conquer
        // - Merge lists pairwise until one list remains
        // Time: O(N log k), Space: O(1)
        
        return null;
    }
    
    // Helper to create list from array
    static ListNode createList(int[] arr) {
        if (arr.length == 0) return null;
        ListNode head = new ListNode(arr[0]);
        ListNode current = head;
        for (int i = 1; i < arr.length; i++) {
            current.next = new ListNode(arr[i]);
            current = current.next;
        }
        return head;
    }
    
    public static void main(String[] args) {
        Solution solution = new Solution();
        ListNode[] lists = {
            createList(new int[]{1, 4, 5}),
            createList(new int[]{1, 3, 4}),
            createList(new int[]{2, 6})
        };
        ListNode result = solution.mergeKLists(lists);
        // Expected: 1 -> 1 -> 2 -> 3 -> 4 -> 4 -> 5 -> 6
    }
}`,

      cpp: `#include <iostream>
#include <vector>
#include <queue>
using namespace std;

struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};

class Solution {
public:
    /**
     * Merge k sorted linked lists.
     * 
     * @param lists Vector of linked list heads
     * @return Head of merged sorted list
     */
    ListNode* mergeKLists(vector<ListNode*>& lists) {
        // TODO: Implement your solution here
        
        // Approach 1: Min-Heap (priority_queue)
        // - Add all list heads to a min-heap
        // - Pop min, add to result, push next node
        // Time: O(N log k), Space: O(k)
        
        // Approach 2: Divide and Conquer
        // - Merge lists pairwise until one list remains
        // Time: O(N log k), Space: O(1)
        
        return nullptr;
    }
};

// Helper to create list from vector
ListNode* createList(vector<int>& arr) {
    if (arr.empty()) return nullptr;
    ListNode* head = new ListNode(arr[0]);
    ListNode* current = head;
    for (int i = 1; i < arr.size(); i++) {
        current->next = new ListNode(arr[i]);
        current = current->next;
    }
    return head;
}

int main() {
    Solution solution;
    vector<int> a1 = {1, 4, 5};
    vector<int> a2 = {1, 3, 4};
    vector<int> a3 = {2, 6};
    vector<ListNode*> lists = {createList(a1), createList(a2), createList(a3)};
    ListNode* result = solution.mergeKLists(lists);
    // Expected: 1 -> 1 -> 2 -> 3 -> 4 -> 4 -> 5 -> 6
    return 0;
}`,

      c: `#include <stdio.h>
#include <stdlib.h>

struct ListNode {
    int val;
    struct ListNode *next;
};

/**
 * Merge k sorted linked lists.
 * 
 * @param lists    Array of linked list heads
 * @param listsSize Number of lists
 * @return Head of merged sorted list
 */
struct ListNode* mergeKLists(struct ListNode** lists, int listsSize) {
    // TODO: Implement your solution here
    
    // Approach: Divide and Conquer
    // - Merge lists pairwise until one list remains
    // - Helper function to merge two sorted lists
    // Time: O(N log k), Space: O(1)
    
    return NULL;
}

// Helper to create list from array
struct ListNode* createList(int* arr, int size) {
    if (size == 0) return NULL;
    struct ListNode* head = malloc(sizeof(struct ListNode));
    head->val = arr[0];
    head->next = NULL;
    struct ListNode* current = head;
    for (int i = 1; i < size; i++) {
        current->next = malloc(sizeof(struct ListNode));
        current->next->val = arr[i];
        current->next->next = NULL;
        current = current->next;
    }
    return head;
}

int main() {
    int a1[] = {1, 4, 5};
    int a2[] = {1, 3, 4};
    int a3[] = {2, 6};
    struct ListNode* lists[3];
    lists[0] = createList(a1, 3);
    lists[1] = createList(a2, 3);
    lists[2] = createList(a3, 2);
    struct ListNode* result = mergeKLists(lists, 3);
    // Expected: 1 -> 1 -> 2 -> 3 -> 4 -> 4 -> 5 -> 6
    return 0;
}`
    }
  },
  {
    id: "DSA_H002",
    difficulty: "Hard",
    title: "Trapping Rain Water",
    description: "Given n non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.",
    examples: [
      { input: "height = [0,1,0,2,1,0,1,3,2,1,2,1]", output: "6", explanation: "The elevation map can trap 6 units of rain water." },
      { input: "height = [4,2,0,3,2,5]", output: "9" }
    ],
    constraints: [
      "n == height.length",
      "1 <= n <= 2 * 10^4",
      "0 <= height[i] <= 10^5"
    ],
    testCases: [
      { input: "[0,1,0,2,1,0,1,3,2,1,2,1]", expectedOutput: "6" },
      { input: "[4,2,0,3,2,5]", expectedOutput: "9" }
    ],
    hints: [
      "For each position, water trapped = min(maxLeft, maxRight) - height",
      "Use two pointers from both ends",
      "Or precompute maxLeft and maxRight arrays"
    ],
    topic: "Two Pointers / Dynamic Programming",
    functionName: "trap",
    templates: {
      javascript: `/**
 * Calculate how much water can be trapped.
 * @param {number[]} height - Array of bar heights
 * @return {number} - Total units of trapped water
 */
function trap(height) {
    // TODO: Implement your solution here
    
    // Approach 1: Two Pointers (Optimal)
    // - Track maxLeft and maxRight as you iterate
    // - Water at position = min(maxL, maxR) - height
    // Time: O(n), Space: O(1)
    
    // Approach 2: DP with arrays
    // - Precompute maxLeft[] and maxRight[]
    // Time: O(n), Space: O(n)
    
    return 0;
}

// Test your solution
console.log(trap([0,1,0,2,1,0,1,3,2,1,2,1])); // Expected: 6
console.log(trap([4,2,0,3,2,5])); // Expected: 9`,

      python: `from typing import List

class Solution:
    def trap(self, height: List[int]) -> int:
        """
        Calculate how much water can be trapped.
        
        Args:
            height: List of bar heights
            
        Returns:
            Total units of trapped water
        """
        # TODO: Implement your solution here
        
        # Approach 1: Two Pointers (Optimal)
        # - Track max_left and max_right as you iterate
        # - Water at position = min(max_l, max_r) - height
        # Time: O(n), Space: O(1)
        
        # Approach 2: DP with arrays
        # - Precompute max_left[] and max_right[]
        # Time: O(n), Space: O(n)
        
        return 0


# Test your solution
if __name__ == "__main__":
    solution = Solution()
    print(solution.trap([0,1,0,2,1,0,1,3,2,1,2,1]))  # Expected: 6
    print(solution.trap([4,2,0,3,2,5]))  # Expected: 9`,

      java: `class Solution {
    /**
     * Calculate how much water can be trapped.
     * 
     * @param height Array of bar heights
     * @return Total units of trapped water
     */
    public int trap(int[] height) {
        // TODO: Implement your solution here
        
        // Approach 1: Two Pointers (Optimal)
        // - Track maxLeft and maxRight as you iterate
        // - Water at position = min(maxL, maxR) - height
        // Time: O(n), Space: O(1)
        
        // Approach 2: DP with arrays
        // - Precompute maxLeft[] and maxRight[]
        // Time: O(n), Space: O(n)
        
        return 0;
    }
    
    public static void main(String[] args) {
        Solution solution = new Solution();
        System.out.println(solution.trap(new int[]{0,1,0,2,1,0,1,3,2,1,2,1})); // Expected: 6
        System.out.println(solution.trap(new int[]{4,2,0,3,2,5})); // Expected: 9
    }
}`,

      cpp: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

class Solution {
public:
    /**
     * Calculate how much water can be trapped.
     * 
     * @param height Vector of bar heights
     * @return Total units of trapped water
     */
    int trap(vector<int>& height) {
        // TODO: Implement your solution here
        
        // Approach 1: Two Pointers (Optimal)
        // - Track maxLeft and maxRight as you iterate
        // - Water at position = min(maxL, maxR) - height
        // Time: O(n), Space: O(1)
        
        // Approach 2: DP with arrays
        // - Precompute maxLeft[] and maxRight[]
        // Time: O(n), Space: O(n)
        
        return 0;
    }
};

int main() {
    Solution solution;
    vector<int> h1 = {0,1,0,2,1,0,1,3,2,1,2,1};
    vector<int> h2 = {4,2,0,3,2,5};
    cout << solution.trap(h1) << endl; // Expected: 6
    cout << solution.trap(h2) << endl; // Expected: 9
    return 0;
}`,

      c: `#include <stdio.h>

/**
 * Calculate how much water can be trapped.
 * 
 * @param height     Array of bar heights
 * @param heightSize Size of the array
 * @return Total units of trapped water
 */
int trap(int* height, int heightSize) {
    // TODO: Implement your solution here
    
    // Approach: Two Pointers (Optimal)
    // - Track maxLeft and maxRight as you iterate
    // - Water at position = min(maxL, maxR) - height
    // Time: O(n), Space: O(1)
    
    return 0;
}

int main() {
    int h1[] = {0,1,0,2,1,0,1,3,2,1,2,1};
    int h2[] = {4,2,0,3,2,5};
    printf("%d\\n", trap(h1, 12)); // Expected: 6
    printf("%d\\n", trap(h2, 6)); // Expected: 9
    return 0;
}`
    }
  }
];

export const getQuestionsByDifficulty = (difficulty: "Easy" | "Medium" | "Hard"): DSAQuestion[] => {
  return dsaQuestions.filter(q => q.difficulty === difficulty);
};

import { getNewDSAQuestions } from "./dsaQuestionsBank";

export const allDSAQuestions = [...dsaQuestions, ...getNewDSAQuestions()];

/** DSA round: 3 questions, 30 min each, 90 min total. Pass: 60/100. */
export const DSA_QUESTIONS_COUNT = 3;
export const DSA_MINUTES_PER_QUESTION = 30;
export const DSA_TOTAL_MINUTES = DSA_QUESTIONS_COUNT * DSA_MINUTES_PER_QUESTION; // 90
export const DSA_PASS_THRESHOLD = 60;

import { generateDSATestByRoleAndExperience } from "./dsaRoleDifficulty";

/** Generate DSA questions by role + experience. Use targetJobTitle (first/main role) and experienceYears. */
export const generateDSATest = (
  experienceYears: number,
  targetJobTitle?: string | null
): DSAQuestion[] => {
  return generateDSATestByRoleAndExperience(
    targetJobTitle ?? null,
    experienceYears,
    allDSAQuestions,
    DSA_QUESTIONS_COUNT
  );
};

export const getLanguageIcon = (language: ProgrammingLanguage): string => {
  const icons: Record<ProgrammingLanguage, string> = {
    javascript: '🟨',
    python: '🐍',
    java: '☕',
    cpp: '⚡',
    c: '🔧',
  };
  return icons[language];
};