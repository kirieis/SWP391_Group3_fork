package edu.fpt.dsa;

import java.util.Arrays;
import java.util.Scanner;

interface Orderer {
    void order(int[] values);
}

public class NumberToolkit {
    private int comparisons = 0;
    private int swaps = 0;

    private boolean outOfOrder(int left, int right) {
        comparisons++;
        return left > right;
    }

    private void swapAt(int[] values, int first, int second) {
        int holder = values[first];
        values[first] = values[second];
        values[second] = holder;
        swaps++;
    }

    public Orderer bubble() {
        return values -> {
            boolean again = true;
            int limit = values.length - 1;
            while (again && limit > 0) {
                again = false;
                for (int p = 0; p < limit; p++) {
                    if (outOfOrder(values[p], values[p + 1])) {
                        swapAt(values, p, p + 1);
                        again = true;
                    }
                }
                limit--;
            }
        };
    }

    public Orderer insertion() {
        return values -> {
            for (int p = 1; p < values.length; p++) {
                int q = p;
                while (q > 0 && outOfOrder(values[q - 1], values[q])) {
                    swapAt(values, q, q - 1);
                    q--;
                }
            }
        };
    }

    public int locate(int[] values, int wanted) {
        return locate(values, wanted, 0, values.length - 1);
    }

    private int locate(int[] values, int wanted, int from, int to) {
        if (from > to) {
            return -1;
        }
        int middle = from + (to - from) / 2;
        if (values[middle] == wanted) {
            return middle;
        }
        return values[middle] < wanted
                ? locate(values, wanted, middle + 1, to)
                : locate(values, wanted, from, middle - 1);
    }

    public int commonDivisor(int x, int y) {
        int big = Math.max(x, y);
        int small = Math.min(x, y);
        return small == 0 ? big : commonDivisor(small, big % small);
    }

    public static void main(String[] args) {
        NumberToolkit kit = new NumberToolkit();
        Scanner in = new Scanner(System.in);
        int[] arr = new int[in.nextInt()];
        for (int z = 0; z < arr.length; z++) {
            arr[z] = in.nextInt();
        }
        kit.bubble().order(arr);
        System.out.println("Sorted: " + Arrays.toString(arr));
        System.out.println("Position of 42: " + kit.locate(arr, 42));
        System.out.println("GCD: " + kit.commonDivisor(48, 18));
        System.out.println("Stats: " + kit.comparisons + "/" + kit.swaps);
    }
}
