{
    questionType: "Hard",

    questionName: "Twin River Water Balance",

    question: `Two ancient kingdoms store water measurements from their rivers in two separate sorted arrays riverA and riverB. 
Each value represents the water level recorded during a specific time period.

The royal engineers want to determine the central balanced water level after combining both records together.

Your task is to return the median value of the combined sorted measurements.

The overall time complexity of your solution should be O(log(m + n)).`,

    preBuiltFunction: [{
        language: "Python",
        languageCode: "python",
        code: `class Solution:
    def solve(self, riverA, riverB):
        # TODO: implement
        pass

if _name_ == "_main_":
    pass`
    }],

    testCases: [
        {
            input: "2\n1 3\n1\n2",
            output: "2.0"
        },
        {
            input: "2\n1 2\n2\n3 4",
            output: "2.5"
        }
    ],

    followUpQuestions: [
        {
            question: "In an efficient solution for this problem, why is binary search usually applied on the smaller of the two arrays?",
            options: [
                "Because the smaller array is always sorted and the larger array is not",
                "Because it reduces the search space and helps avoid invalid partition indexes",
                "Because the median must always be present in the smaller array",
                "Because binary search cannot be performed on the larger array"
            ],
            correctAnswer: "B",
            explanation: "Binary searching on the smaller array keeps the search range minimal and makes it easier to handle partition boundaries safely."
        },
        {
            question: "After choosing partition positions in both arrays, which condition confirms that the left and right halves are correctly divided?",
            options: [
                "leftA <= rightA and leftB <= rightB",
                "leftA <= rightB and leftB <= rightA",
                "leftA + leftB == rightA + rightB",
                "rightA <= leftB and rightB <= leftA"
            ],
            correctAnswer: "B",
            explanation: "The correct partition is found when every element on the combined left side is less than or equal to every element on the combined right side."
        },
        {
            question: "If the total number of elements in both arrays is odd, what should the median be after finding the correct partition?",
            options: [
                "The minimum value from the right side",
                "The average of the two middle values",
                "The maximum value from the left side",
                "The first element of the larger array"
            ],
            correctAnswer: "C",
            explanation: "When the total length is odd, the left half contains one extra element, so the median is the maximum value from the left side."
        }
    ],

    questionNumber: 1
}